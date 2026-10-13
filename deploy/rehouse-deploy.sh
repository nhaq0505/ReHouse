#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077

readonly image_pattern='^ghcr\.io/nhaq0505/rehouse@sha256:[a-f0-9]{64}$'
readonly compose_file=/opt/rehouse/compose.yaml
readonly runtime_env=/etc/rehouse/runtime.env
readonly state_dir=/var/lib/rehouse
readonly backup_command=/usr/local/sbin/rehouse-backup
readonly lock_file=/var/lib/rehouse/ops.lock

fail() {
  printf 'rehouse-deploy: %s\n' "$1" >&2
  exit 1
}

[[ "$EUID" -eq 0 ]] || fail 'must run as root'
[[ "$#" -eq 1 ]] || fail 'expected one immutable ghcr.io/nhaq0505/rehouse@sha256:<digest> argument'
readonly image_ref=$1
[[ "$image_ref" =~ $image_pattern ]] || fail 'image reference must be an immutable digest from ghcr.io/nhaq0505/rehouse'
[[ -f "$compose_file" && ! -L "$compose_file" ]] || fail 'root-owned Compose file is missing'
[[ -f "$runtime_env" && ! -L "$runtime_env" ]] || fail 'root-only runtime environment file is missing'

mkdir -p -m 0700 /var/lib/rehouse
mkdir -p -m 0700 /var/backups/rehouse
chmod 0700 /etc/rehouse /var/lib/rehouse /var/backups/rehouse
exec 9>"$lock_file"
flock --exclusive --wait 600 9 || fail 'another Rehouse backup, restore, or deployment is still running'
export REHOUSE_LOCK_HELD=1

temp_docker_config=$(mktemp -d /run/rehouse-ghcr.XXXXXX)
chmod 0700 "$temp_docker_config"
cleanup() {
  rm -rf -- "$temp_docker_config"
}
trap cleanup EXIT HUP INT TERM

ghcr_token=''
IFS= read -r ghcr_token || [[ -n "$ghcr_token" ]] || fail 'a GHCR token is required on stdin'
[[ -n "$ghcr_token" ]] || fail 'a GHCR token is required on stdin'
printf '%s' "$ghcr_token" | DOCKER_CONFIG="$temp_docker_config" docker login ghcr.io --username nhaq0505 --password-stdin >/dev/null
unset ghcr_token
DOCKER_CONFIG="$temp_docker_config" docker pull "$image_ref"
DOCKER_CONFIG="$temp_docker_config" docker logout ghcr.io >/dev/null 2>&1 || true
rm -rf -- "$temp_docker_config"
trap - EXIT HUP INT TERM

cd /opt/rehouse
compose() {
  local selected_image=$1
  shift
  IMAGE_REF="$selected_image" docker compose --project-name rehouse --env-file "$runtime_env" --file "$compose_file" "$@"
}

compose "$image_ref" config --quiet
docker image inspect "$image_ref" >/dev/null 2>&1 || fail 'pulled image is not available locally'

previous_image=''
if [[ -f "$state_dir/current-image" ]]; then
  IFS= read -r previous_image < "$state_dir/current-image" || true
  if [[ -n "$previous_image" && ! "$previous_image" =~ $image_pattern ]]; then
    fail 'saved current image reference is invalid; inspect /var/lib/rehouse/current-image'
  fi
fi

compose "$image_ref" up -d db

wait_for_db() {
  local attempt db_id status
  for ((attempt = 0; attempt < 60; attempt++)); do
    db_id=$(compose "$image_ref" ps -q db 2>/dev/null || true)
    if [[ -n "$db_id" ]]; then
      status=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}starting{{end}}' "$db_id" 2>/dev/null || true)
      [[ "$status" == healthy ]] && return 0
      [[ "$status" == unhealthy ]] && return 1
    fi
    sleep 2
  done
  return 1
}

wait_for_db || fail 'PostgreSQL did not become healthy; the current app was left running'

backup_ref=${previous_image:-$image_ref}
backup_dir=$("$backup_command" "$backup_ref") || fail 'pre-deploy database/key backup failed; the current app was left running'
new_compose_started=0
if compose "$image_ref" up -d --no-deps --force-recreate app; then
  new_compose_started=1
else
  printf 'Compose reported an error while starting the new app image.\n' >&2
fi

wait_for_app() {
  local selected_image=$1
  local attempt
  for ((attempt = 0; attempt < 60; attempt++)); do
    if curl --fail --silent --max-time 4 http://127.0.0.1:8080/api/health >/dev/null; then
      local query_result admin_count app_id app_uid app_gid keys_owner
      query_result=$(compose "$selected_image" exec -T db psql --no-psqlrc -At -v ON_ERROR_STOP=1 -U room_rental -d room_rental -c 'SELECT 1' 2>/dev/null || true)
      admin_count=$(compose "$selected_image" exec -T db psql --no-psqlrc -At -v ON_ERROR_STOP=1 -U room_rental -d room_rental -c "SELECT count(*) FROM \"Users\" WHERE \"Email\"='admin@rehouse.local' AND \"Role\"='Admin'" 2>/dev/null || true)
      app_id=$(compose "$selected_image" ps -q app 2>/dev/null || true)
      if [[ "$query_result" == 1 && "$admin_count" =~ ^[1-9][0-9]*$ && -n "$app_id" ]]; then
        app_uid=$(docker exec "$app_id" id -u 2>/dev/null || true)
        app_gid=$(docker exec "$app_id" id -g 2>/dev/null || true)
        keys_owner=$(docker exec "$app_id" stat -c '%u:%g' /app/data/keys 2>/dev/null || true)
        if [[ -n "$app_uid" && -n "$app_gid" && "$keys_owner" == "$app_uid:$app_gid" ]] && \
           docker exec "$app_id" /bin/sh -c 'test -d /app/data/keys && test -w /app/data/keys' >/dev/null 2>&1; then
          return 0
        fi
      fi
    fi
    sleep 2
  done
  return 1
}

if [[ "$new_compose_started" -eq 1 ]] && wait_for_app "$image_ref"; then
  marker_tmp=$(mktemp "$state_dir/current-image.XXXXXX")
  printf '%s\n' "$image_ref" > "$marker_tmp"
  chmod 0600 "$marker_tmp"
  mv -f -- "$marker_tmp" "$state_dir/current-image"
  printf 'Rehouse is healthy at http://127.0.0.1:8080/api/health\n'
  printf 'Pre-deploy backup: %s\n' "$backup_dir"
  exit 0
fi

if [[ -n "$previous_image" ]]; then
  printf 'New image failed health checks; restoring the previous app image.\n' >&2
  compose "$previous_image" up -d --no-deps --force-recreate app || true
  if wait_for_app "$previous_image"; then
    printf 'Previous app image is healthy again. Database was left as-is; backup: %s\n' "$backup_dir" >&2
    exit 1
  fi
  printf 'Previous app image did not become healthy. Database was left as-is; backup: %s\n' "$backup_dir" >&2
  exit 2
fi

compose "$image_ref" stop app >/dev/null 2>&1 || true
printf 'First deployment failed its health check. Backup: %s\n' "$backup_dir" >&2
exit 1
