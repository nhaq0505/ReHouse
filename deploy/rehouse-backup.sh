#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077

readonly image_pattern='^ghcr\.io/nhaq0505/rehouse@sha256:[a-f0-9]{64}$'
readonly compose_file=/opt/rehouse/compose.yaml
readonly runtime_env=/etc/rehouse/runtime.env
readonly backup_root=/var/backups/rehouse
readonly state_dir=/var/lib/rehouse
readonly lock_file=/var/lib/rehouse/ops.lock

fail() {
  printf 'rehouse-backup: %s\n' "$1" >&2
  exit 1
}

[[ "$EUID" -eq 0 ]] || fail 'must run as root'
[[ "$#" -le 1 ]] || fail 'accepts at most one image reference for the backup manifest'
[[ -f "$compose_file" && -f "$runtime_env" ]] || fail 'Rehouse host files are missing'
if [[ "${REHOUSE_LOCK_HELD:-}" != 1 ]]; then
  exec 9>"$lock_file"
  flock --exclusive --wait 600 9 || fail 'another Rehouse backup, restore, or deployment is still running'
fi

image_ref=''
if [[ "$#" -eq 1 ]]; then
  image_ref=$1
elif [[ -f "$state_dir/current-image" ]]; then
  IFS= read -r image_ref < "$state_dir/current-image" || true
fi
if [[ -n "$image_ref" && ! "$image_ref" =~ $image_pattern ]]; then
  fail 'image reference must be an immutable digest from ghcr.io/nhaq0505/rehouse'
fi

cd /opt/rehouse
compose() {
  local selected_image=$1
  shift
  IMAGE_REF="$selected_image" docker compose --project-name rehouse --env-file "$runtime_env" --file "$compose_file" "$@"
}

assert_fresh_empty_database() {
  [[ ! -e "$state_dir/current-image" ]] || fail 'the deployed DataProtection volume is missing; refusing an incomplete backup'
  local table_count
  table_count=$(compose "$image_ref" exec -T db psql --no-psqlrc -At -v ON_ERROR_STOP=1 \
    -U room_rental -d room_rental -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'" 2>/dev/null) || \
    fail 'cannot verify an empty first-deployment database; refusing an incomplete backup'
  [[ "$table_count" == 0 ]] || fail 'the DataProtection volume is empty while application tables exist; refusing an incomplete backup'
}

[[ -n "$image_ref" ]] || fail 'no image reference is available for Compose'
db_id=$(compose "$image_ref" ps -q db 2>/dev/null || true)
[[ -n "$db_id" ]] || fail 'PostgreSQL is not running'

stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir=$(mktemp -d "$backup_root/rehouse-$stamp-XXXXXX")
chmod 0700 "$backup_dir"
cleanup_failed_backup() {
  local status=$?
  if [[ "$status" -ne 0 && -n "${backup_dir:-}" && -d "$backup_dir" ]]; then
    rm -rf -- "$backup_dir"
  fi
}
trap cleanup_failed_backup EXIT

compose "$image_ref" exec -T db pg_dump -U room_rental -d room_rental -Fc > "$backup_dir/database.dump"

keys_mount=$(docker volume inspect --format '{{.Mountpoint}}' rehouse_data_protection_keys 2>/dev/null || true)
if [[ -n "$keys_mount" && -d "$keys_mount" ]]; then
  if ! find "$keys_mount" -type f -print -quit | grep -q .; then
    assert_fresh_empty_database
  fi
  tar -C "$keys_mount" -czf "$backup_dir/data-protection-keys.tar.gz" .
else
  assert_fresh_empty_database
  tar -czf "$backup_dir/data-protection-keys.tar.gz" --files-from /dev/null
fi

{
  printf 'created_utc=%s\n' "$stamp"
  printf 'image_ref=%s\n' "$image_ref"
  printf 'database=PostgreSQL custom dump, database room_rental\n'
  printf 'data_protection_keys=data-protection-keys.tar.gz\n'
} > "$backup_dir/manifest.txt"
chmod 0600 "$backup_dir"/*

mapfile -t existing_backups < <(find "$backup_root" -mindepth 1 -maxdepth 1 -type d -name 'rehouse-*' -printf '%T@ %p\n' | sort -nr | cut -d' ' -f2-)
for ((index = 10; index < ${#existing_backups[@]}; index++)); do
  rm -rf -- "${existing_backups[index]}"
done

trap - EXIT
printf '%s\n' "$backup_dir"
