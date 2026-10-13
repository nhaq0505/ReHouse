#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
  echo "Usage: import.sh <room_rental_rehearsal|room_rental> <sqlite-backup>" >&2
  exit 2
fi

target_database=$1
source_backup=$2
root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
credentials_file="$root_dir/backend/RoomRental.Api/.local-data/postgres-migration/postgres.env"
confirmation_arg=

case "$target_database" in
  room_rental_rehearsal)
    ;;
  room_rental)
    if [ "${ROOMRENTAL_FINAL_IMPORT_APPROVED:-}" != "YES" ]; then
      echo "The final cutover database requires explicit root approval via ROOMRENTAL_FINAL_IMPORT_APPROVED=YES." >&2
      exit 1
    fi
    confirmation_arg=--confirm-final-target
    ;;
  *)
    echo "Target must be room_rental_rehearsal or room_rental." >&2
    exit 2
    ;;
esac

if [ ! -f "$credentials_file" ]; then
  echo "PostgreSQL credentials are missing; run start-target.sh first." >&2
  exit 1
fi

if [ -n "$confirmation_arg" ]; then
  dotnet run --project "$root_dir/backend/RoomRental.DbMigrator/RoomRental.DbMigrator.csproj" -- \
    --source "$source_backup" --credentials "$credentials_file" --database "$target_database" \
    --host 127.0.0.1 --port 15432 "$confirmation_arg"
else
  dotnet run --project "$root_dir/backend/RoomRental.DbMigrator/RoomRental.DbMigrator.csproj" -- \
    --source "$source_backup" --credentials "$credentials_file" --database "$target_database" \
    --host 127.0.0.1 --port 15432
fi
