#!/usr/bin/env bash
set -Eeuo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077

readonly runtime_env=/etc/rehouse/runtime.env
readonly state_dir=/var/lib/rehouse
readonly compose_file=/opt/rehouse/compose.yaml
readonly caddyfile=/etc/caddy/Caddyfile
readonly lock_file=/var/lib/rehouse/ops.lock
readonly image_pattern='^ghcr\.io/nhaq0505/rehouse@sha256:[a-f0-9]{64}$'

fail() {
  printf 'configure-public-origin: %s\n' "$1" >&2
  exit 1
}

[[ "$EUID" -eq 0 ]] || fail 'must run as root'
[[ "$#" -eq 2 ]] || fail 'usage: configure-public-origin.sh DOMAIN EXPECTED_PUBLIC_IPV4'
readonly public_domain=$1
readonly expected_ipv4=$2
[[ "$public_domain" =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$ ]] || fail 'invalid lowercase DNS hostname'
python3 - "$expected_ipv4" <<'PY' || fail 'expected public IPv4 address is invalid'
import ipaddress, sys
address = ipaddress.ip_address(sys.argv[1])
if address.version != 4 or address.is_private or address.is_loopback or address.is_unspecified:
    raise SystemExit(1)
PY

[[ -f "$runtime_env" && ! -L "$runtime_env" ]] || fail 'root-only runtime environment file is missing'
[[ -f "$compose_file" && ! -L "$compose_file" ]] || fail 'root-owned Compose file is missing'
[[ -f "$caddyfile" && ! -L "$caddyfile" ]] || fail 'install the reviewed Caddyfile at /etc/caddy/Caddyfile first'
[[ -x /usr/local/sbin/rehouse-backup ]] || fail 'Rehouse backup helper is missing'
[[ -f "$state_dir/current-image" ]] || fail 'current immutable image marker is missing'
command -v caddy >/dev/null 2>&1 || fail 'install Caddy from its official Ubuntu repository first'
command -v getent >/dev/null 2>&1 || fail 'getent is required to verify public DNS'
command -v flock >/dev/null 2>&1 || fail 'flock is required to serialize Rehouse operations'

resolved_ips=$(getent ahostsv4 "$public_domain" | awk '{print $1}' | sort -u)
[[ "$resolved_ips" == "$expected_ipv4" ]] || fail 'DNS A records do not exactly match the expected public IPv4 address'
proxy_ip=$(docker network inspect --format '{{(index .IPAM.Config 0).Gateway}}' rehouse_default 2>/dev/null) || fail 'Rehouse Docker bridge gateway is unavailable'
python3 - "$proxy_ip" <<'PY' || fail 'Rehouse Docker bridge gateway is not an IPv4 address'
import ipaddress, sys
if ipaddress.ip_address(sys.argv[1]).version != 4:
    raise SystemExit(1)
PY

current_image=$(cat "$state_dir/current-image")
[[ "$current_image" =~ $image_pattern ]] || fail 'current immutable image marker is invalid'
docker image inspect "$current_image" >/dev/null 2>&1 || fail 'current immutable image is not available locally'
curl --fail --silent --max-time 5 http://127.0.0.1:8080/api/health >/dev/null || fail 'Rehouse is not healthy before configuration'

mkdir -p -m 0700 "$state_dir" /var/backups/rehouse
exec 9>"$lock_file"
flock --exclusive --wait 600 9 || fail 'another Rehouse backup, restore, or deployment is still running'
export REHOUSE_LOCK_HELD=1

backup_dir=$(/usr/local/sbin/rehouse-backup "$current_image") || fail 'database and DataProtection-key backup failed'
env_snapshot=$(mktemp /run/rehouse-runtime-env.XXXXXX)
caddy_snapshot=$(mktemp /run/rehouse-Caddyfile.XXXXXX)
cp --preserve=mode,ownership "$runtime_env" "$env_snapshot"
cp --preserve=mode,ownership "$caddyfile" "$caddy_snapshot"
old_caddy_active=0
systemctl is-active --quiet caddy && old_caddy_active=1 || true
rollback_enabled=1

wait_for_app() {
  local attempt image_ref=$1 query_result admin_count app_id app_uid app_gid keys_owner
  for ((attempt = 0; attempt < 60; attempt++)); do
    if curl --fail --silent --max-time 4 http://127.0.0.1:8080/api/health >/dev/null; then
      query_result=$(compose "$image_ref" exec -T db psql --no-psqlrc -At -v ON_ERROR_STOP=1 \
        -U room_rental -d room_rental -c 'SELECT 1' 2>/dev/null || true)
      admin_count=$(compose "$image_ref" exec -T db psql --no-psqlrc -At -v ON_ERROR_STOP=1 \
        -U room_rental -d room_rental -c "SELECT count(*) FROM \"Users\" WHERE \"Email\"='admin@rehouse.local' AND \"Role\"='Admin'" 2>/dev/null || true)
      app_id=$(compose "$image_ref" ps -q app 2>/dev/null || true)
      if [[ "$query_result" == 1 && "$admin_count" =~ ^[1-9][0-9]*$ && -n "$app_id" ]]; then
        app_uid=$(docker exec "$app_id" id -u 2>/dev/null || true)
        app_gid=$(docker exec "$app_id" id -g 2>/dev/null || true)
        keys_owner=$(docker exec "$app_id" stat -c '%u:%g' /app/data/keys 2>/dev/null || true)
        if [[ "$app_uid" =~ ^[1-9][0-9]*$ && "$app_gid" =~ ^[0-9]+$ && "$keys_owner" == "$app_uid:$app_gid" ]] && \
           docker exec "$app_id" /bin/sh -c 'test -d /app/data/keys && test -w /app/data/keys' >/dev/null 2>&1; then
          return 0
        fi
      fi
    fi
    sleep 2
  done
  return 1
}

compose() {
  local image_ref=$1
  shift
  IMAGE_REF="$image_ref" docker compose --project-name rehouse --env-file "$runtime_env" --file "$compose_file" "$@"
}

rollback() {
  local status=$?
  if [[ "$rollback_enabled" -eq 1 ]]; then
    cp --preserve=mode,ownership "$env_snapshot" "$runtime_env" 2>/dev/null || true
    cp --preserve=mode,ownership "$caddy_snapshot" "$caddyfile" 2>/dev/null || true
    compose "$current_image" up -d --no-deps --force-recreate app >/dev/null 2>&1 || true
    wait_for_app "$current_image" || true
    if [[ "$old_caddy_active" -eq 1 ]]; then
      caddy validate --config "$caddyfile" --adapter caddyfile >/dev/null 2>&1 && systemctl reload caddy || true
    else
      systemctl stop caddy >/dev/null 2>&1 || true
    fi
  fi
  rm -f -- "${env_snapshot:-}" "${caddy_snapshot:-}"
  exit "$status"
}
trap rollback EXIT

caddy validate --config "$caddyfile" --adapter caddyfile >/dev/null || fail 'Caddyfile validation failed'
python3 - "$runtime_env" "$public_domain" "$proxy_ip" <<'PY'
import os, pathlib, sys, tempfile
path = pathlib.Path(sys.argv[1])
domain, proxy = sys.argv[2:]
updates = {
    "PUBLIC_BASE_URL": f"https://{domain}",
    "WEBHOOK_BASE_URL": f"https://{domain}",
    "TRUSTED_PROXIES": proxy,
}
lines = path.read_text(encoding="utf-8").splitlines()
for key, value in updates.items():
    matches = [i for i, line in enumerate(lines) if line.startswith(key + "=")]
    if len(matches) != 1:
        raise SystemExit(f"expected exactly one {key} entry in runtime config")
    lines[matches[0]] = f"{key}={value}"
fd, temp_name = tempfile.mkstemp(prefix=".runtime.env.", dir=path.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as output:
        output.write("\n".join(lines) + "\n")
        output.flush()
        os.fsync(output.fileno())
    os.chown(temp_name, 0, 0)
    os.replace(temp_name, path)
finally:
    if os.path.exists(temp_name):
        os.unlink(temp_name)
PY

compose "$current_image" up -d --no-deps --force-recreate app >/dev/null || fail 'Rehouse app recreation failed'
wait_for_app "$current_image" || fail 'Rehouse app did not pass post-configuration health, DB, admin, and key-volume smoke checks'
if [[ "$old_caddy_active" -eq 1 ]]; then
  systemctl reload caddy || fail 'Caddy reload failed'
else
  systemctl enable --now caddy || fail 'Caddy did not start'
fi
systemctl is-active --quiet caddy || fail 'Caddy is not active'

rollback_enabled=0
trap - EXIT
rm -f -- "$env_snapshot" "$caddy_snapshot"
printf 'Public origin configured for %s; Rehouse smoke checks passed.\n' "$public_domain"
printf 'Trusted proxy: %s. Pre-change backup: %s\n' "$proxy_ip" "$backup_dir"
