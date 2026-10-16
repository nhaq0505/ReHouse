#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ "$EUID" -eq 0 ]] || { echo 'Run as root' >&2; exit 1; }
source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
command -v rclone >/dev/null || { apt-get update -qq; apt-get install -y rclone; }
install -d -m0700 /etc/rehouse/rclone /var/lib/rehouse
for pair in rehouse-backup.sh:rehouse-backup rehouse-drive-sync.py:rehouse-drive-sync rehouse-backup-alert.py:rehouse-backup-alert; do
  install -m0750 "$source_dir/${pair%%:*}" "/usr/local/sbin/${pair##*:}"
done
for unit in rehouse-backup.service rehouse-backup.timer rehouse-backup-alert.service rehouse-backup-watchdog.service rehouse-backup-watchdog.timer; do
  install -m0644 "$source_dir/$unit" "/etc/systemd/system/$unit"
done
# Recovery input must be staged privately by the operator, never committed.
if [[ -n "${ROOMIE_RCLONE_CONFIG:-}" ]]; then
  [[ -f "$ROOMIE_RCLONE_CONFIG" && ! -L "$ROOMIE_RCLONE_CONFIG" ]] || exit 1
  install -m0600 "$ROOMIE_RCLONE_CONFIG" /etc/rehouse/rclone/rclone.conf
fi
if [[ -n "${ROOMIE_DRIVE_FOLDER_ID:-}" ]]; then
  [[ "$ROOMIE_DRIVE_FOLDER_ID" =~ ^[A-Za-z0-9_-]+$ ]] || exit 1
  printf '%s\n' "$ROOMIE_DRIVE_FOLDER_ID" > /etc/rehouse/backup-drive-folder-id
fi
[[ -s /etc/rehouse/rclone/rclone.conf ]] || { echo 'Stage OAuth/crypt recovery config privately and rerun installer.' >&2; exit 1; }
chmod 0600 /etc/rehouse/rclone/rclone.conf
if [[ ! -s /etc/rehouse/backup-drive-folder-id ]]; then
  python3 - <<'CONFIG'
import configparser
from pathlib import Path
c = configparser.ConfigParser(interpolation=None); c.read('/etc/rehouse/rclone/rclone.conf')
assert c.get('roomie_backup','type') == 'crypt'
folder = c.get('roomie_drive','root_folder_id')
assert folder and all(x.isalnum() or x in '_-' for x in folder)
Path('/etc/rehouse/backup-drive-folder-id').write_text(folder+'\n')
CONFIG
fi
install -d -m0755 /var/www/rehouse-backup
install -m0644 "$source_dir"/backup-disclosure/*.html /var/www/rehouse-backup/
# Preserve existing root-managed hook/recipient.
if [[ ! -e /etc/rehouse/backup.env ]]; then
  cat > /etc/rehouse/backup.env <<'CONFIG'
OFFHOST_SYNC_CMD='/usr/local/sbin/rehouse-drive-sync "$1"'
CONFIG
fi
systemctl daemon-reload
systemctl enable --now rehouse-backup.timer rehouse-backup-watchdog.timer
printf 'Backup helpers installed; configure BACKUP_ALERT_TO in root-only backup.env and verify recovery before trusting this host.\n'
