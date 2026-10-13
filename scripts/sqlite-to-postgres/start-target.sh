#!/bin/sh
set -eu

root_dir=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
config_dir="$root_dir/backend/RoomRental.Api/.local-data/postgres-migration"
credentials_file="$config_dir/postgres.env"
compose_file="$root_dir/scripts/sqlite-to-postgres/compose.yaml"

mkdir -p "$config_dir"
chmod 700 "$config_dir"
if [ ! -f "$credentials_file" ]; then
  python3 - "$credentials_file" <<'PY'
import os, secrets, sys
path = sys.argv[1]
with open(path, 'x', encoding='utf-8') as handle:
    handle.write('POSTGRES_DB=room_rental\n')
    handle.write('POSTGRES_USER=room_rental\n')
    handle.write('POSTGRES_PASSWORD=' + secrets.token_hex(32) + '\n')
os.chmod(path, 0o600)
PY
fi
chmod 600 "$credentials_file"

container_name=rehouse-pg-migration-db
if docker inspect "$container_name" >/dev/null 2>&1; then
  project=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$container_name")
  service=$(docker inspect --format '{{index .Config.Labels "com.docker.compose.service"}}' "$container_name")
  image=$(docker inspect --format '{{.Config.Image}}' "$container_name")
  data_volume=$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/var/lib/postgresql/data"}}{{.Name}}{{end}}{{end}}' "$container_name")
  port_binding=$(docker inspect --format '{{with (index .HostConfig.PortBindings "5432/tcp")}}{{range .}}{{.HostIp}}:{{.HostPort}}{{end}}{{end}}' "$container_name")
  if [ "$project" != "rehouse-pg-migration" ] || [ "$service" != "db" ] || \
     [ "$image" != "postgres:17-alpine" ] || [ "$data_volume" != "rehouse-pg-migration-data" ] || \
     [ "$port_binding" != "127.0.0.1:15432" ]; then
    echo "A container named $container_name exists but is not the expected owned PostgreSQL target; refusing to replace it." >&2
    exit 1
  fi
elif command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:15432 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port 15432 is already in use by another process; refusing to start the migration PostgreSQL target." >&2
  exit 1
fi

if docker volume inspect rehouse-pg-migration-data >/dev/null 2>&1; then
  volume_project=$(docker volume inspect --format '{{index .Labels "com.docker.compose.project"}}' rehouse-pg-migration-data)
  volume_key=$(docker volume inspect --format '{{index .Labels "com.docker.compose.volume"}}' rehouse-pg-migration-data)
  if [ "$volume_project" != "rehouse-pg-migration" ] || [ "$volume_key" != "postgres_migration_data" ]; then
    echo "A volume named rehouse-pg-migration-data exists but is not the expected owned PostgreSQL volume; refusing to use it." >&2
    exit 1
  fi
fi

docker compose -f "$compose_file" -p rehouse-pg-migration up -d db
attempt=0
while [ "$attempt" -lt 36 ]; do
  if docker compose -f "$compose_file" -p rehouse-pg-migration exec -T db pg_isready -U room_rental -d room_rental >/dev/null 2>&1; then
    break
  fi
  attempt=$((attempt + 1))
  sleep 2
done
if [ "$attempt" -ge 36 ]; then
  echo "PostgreSQL did not become ready." >&2
  exit 1
fi

if ! docker compose -f "$compose_file" -p rehouse-pg-migration exec -T db psql -U room_rental -d room_rental -Atqc "SELECT 1 FROM pg_database WHERE datname = 'room_rental_rehearsal'" | grep -qx 1; then
  docker compose -f "$compose_file" -p rehouse-pg-migration exec -T db createdb -U room_rental room_rental_rehearsal
fi

echo "PostgreSQL 17 ready at 127.0.0.1:15432; databases room_rental (final target) and room_rental_rehearsal are available."
echo "Credentials are stored in the ignored mode-0600 file: $credentials_file"
