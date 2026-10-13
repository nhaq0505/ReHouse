#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077

readonly image_pattern='^ghcr\.io/nhaq0505/rehouse@sha256:[a-f0-9]{64}$'
readonly compose_file=/opt/rehouse/compose.yaml
readonly runtime_env=/etc/rehouse/runtime.env
readonly state_dir=/var/lib/rehouse
readonly lock_file=/var/lib/rehouse/ops.lock

fail() {
  printf 'rehouse-restore: %s\n' "$1" >&2
  exit 1
}

[[ "$EUID" -eq 0 ]] || fail 'must run as root'
[[ "$#" -eq 2 && "$2" == --replace-current-data ]] || fail 'usage: rehouse-restore BACKUP_DIR --replace-current-data'
[[ -d "$1" ]] || fail 'backup directory is missing'
backup_dir=$(realpath -e -- "$1")
[[ "$backup_dir" == /var/backups/rehouse/rehouse-* ]] || fail 'backup must be inside /var/backups/rehouse'
[[ -s "$backup_dir/database.dump" && -f "$backup_dir/data-protection-keys.tar.gz" && -f "$backup_dir/manifest.txt" ]] || fail 'backup is incomplete'
[[ -f "$compose_file" && -f "$runtime_env" ]] || fail 'Rehouse host files are missing'
exec 9>"$lock_file"
flock --exclusive --wait 600 9 || fail 'another Rehouse backup, restore, or deployment is still running'

image_ref=$(sed -n 's/^image_ref=//p' "$backup_dir/manifest.txt" | head -n 1)
[[ "$image_ref" =~ $image_pattern ]] || fail 'backup manifest has an invalid image reference'
docker image inspect "$image_ref" >/dev/null 2>&1 || fail 'the backup image is not present locally; restore it through the deployment helper first'

cd /opt/rehouse
compose() {
  local selected_image=$1
  shift
  IMAGE_REF="$selected_image" docker compose --project-name rehouse --env-file "$runtime_env" --file "$compose_file" "$@"
}

compose "$image_ref" up -d db
for ((attempt = 0; attempt < 60; attempt++)); do
  if compose "$image_ref" exec -T db psql --no-psqlrc -At -v ON_ERROR_STOP=1 -U room_rental -d room_rental -c 'SELECT 1' >/dev/null 2>&1; then
    break
  fi
  sleep 2
done
compose "$image_ref" exec -T db psql --no-psqlrc -At -v ON_ERROR_STOP=1 -U room_rental -d room_rental -c 'SELECT 1' >/dev/null 2>&1 || fail 'PostgreSQL is not ready'
compose "$image_ref" stop app >/dev/null 2>&1 || true
docker volume inspect rehouse_data_protection_keys >/dev/null 2>&1 || docker volume create rehouse_data_protection_keys >/dev/null
keys_mount=$(docker volume inspect --format '{{.Mountpoint}}' rehouse_data_protection_keys)
find "$keys_mount" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +
tar -C "$keys_mount" --same-owner -xzf "$backup_dir/data-protection-keys.tar.gz"

compose "$image_ref" exec -T db pg_restore -U room_rental -d room_rental --clean --if-exists --no-owner < "$backup_dir/database.dump"

marker_tmp=$(mktemp "$state_dir/current-image.XXXXXX")
printf '%s\n' "$image_ref" > "$marker_tmp"
chmod 0600 "$marker_tmp"
mv -f -- "$marker_tmp" "$state_dir/current-image"
compose "$image_ref" up -d --no-deps --force-recreate app

for ((attempt = 0; attempt < 60; attempt++)); do
  if curl --fail --silent --max-time 4 http://127.0.0.1:8080/api/health >/dev/null && \
     compose "$image_ref" exec -T db psql --no-psqlrc -At -v ON_ERROR_STOP=1 -U room_rental -d room_rental -c 'SELECT 1' >/dev/null 2>&1 && \
     compose "$image_ref" exec -T db psql --no-psqlrc -At -v ON_ERROR_STOP=1 -U room_rental -d room_rental -c "SELECT count(*) FROM \"Users\" WHERE \"Email\"='admin@rehouse.local' AND \"Role\"='Admin'" 2>/dev/null | grep -Eq '^[1-9][0-9]*$'; then
    printf 'Restored backup is healthy at http://127.0.0.1:8080/api/health\n'
    exit 0
  fi
  sleep 2
done
fail 'restored database and keys are in place, but the app did not pass its health check'
