#!/usr/bin/env python3
"""Copy completed Roomie backups through rclone crypt; verify before rotating."""
import datetime as dt
import json
import os
from pathlib import Path
import re
import subprocess
import sys

CONFIG = "/etc/rehouse/rclone/rclone.conf"
DEST = "roomie_backup:snapshots"
BACKUP_NAME = re.compile(r"rehouse-(\d{8}T\d{6}Z)-[A-Za-z0-9]{6}\Z")


def retention_keep(names):
    snapshots = []
    for name in names:
        match = BACKUP_NAME.fullmatch(name)
        if match:
            try:
                stamp = dt.datetime.strptime(match[1], "%Y%m%dT%H%M%SZ")
            except ValueError:
                continue
            snapshots.append((stamp, name))
    snapshots.sort(reverse=True)
    keep = set()
    # Keep the latest point in each selected day, ISO week and calendar month.
    for limit, bucket in [(7, lambda d: d.date()),
                          (4, lambda d: d.isocalendar()[:2]),
                          (3, lambda d: (d.year, d.month))]:
        seen = set()
        for stamp, name in snapshots:
            key = bucket(stamp)
            if key not in seen and len(seen) < limit:
                seen.add(key)
                keep.add(name)
    return keep


def rclone(*args, capture=False):
    return subprocess.run(["/usr/bin/rclone", "--config", CONFIG, "--contimeout", "15s", "--timeout", "60s", "--retries", "2", *args],
                          check=True, text=True, timeout=300, stdin=subprocess.DEVNULL,
                          stdout=subprocess.PIPE if capture else subprocess.DEVNULL)


def main():
    if os.geteuid() != 0 or len(sys.argv) != 2:
        raise SystemExit("Usage (root): rehouse-drive-sync /var/backups/rehouse/rehouse-...")
    source = Path(sys.argv[1]).resolve(strict=True)
    if source.parent != Path("/var/backups/rehouse") or not BACKUP_NAME.fullmatch(source.name):
        raise SystemExit("Refusing a source outside the Roomie backup directory")
    for name in ["database.dump", "data-protection-keys.tar.gz", "manifest.txt"]:
        item = source / name
        if not item.is_file() or item.is_symlink() or item.stat().st_size == 0:
            raise SystemExit("Backup is incomplete")
    # Fail closed: this remote must be crypt, never a bare Drive destination.
    import configparser
    config = configparser.ConfigParser(interpolation=None)
    config.read(CONFIG)
    if config.get("roomie_backup", "type", fallback="") != "crypt":
        raise SystemExit("Encrypted backup remote is not configured")
    if (config.get("roomie_backup", "remote", fallback="") != "roomie_drive:encrypted"
            or config.get("roomie_drive", "type", fallback="") != "drive"):
        raise SystemExit("Backup destination does not match the approved Drive folder")
    expected = Path("/etc/rehouse/backup-drive-folder-id").read_text().strip()
    if config.get("roomie_drive", "root_folder_id", fallback="") != expected:
        raise SystemExit("Backup destination is not approved")
    target = f"{DEST}/{source.name}"
    rclone("copy", str(source), target, "--max-duration", "10m")
    # Download/decrypt and compare contents, covering all files before retention.
    rclone("check", str(source), target, "--download", "--one-way")
    entries = json.loads(rclone("lsjson", DEST, "--dirs-only", capture=True).stdout)
    names = [item["Name"] for item in entries if item.get("IsDir")]
    if source.name not in names:
        raise SystemExit("Uploaded snapshot is absent; skipping retention")
    keep = retention_keep(names)
    keep.add(source.name)
    for name in names:
        match = BACKUP_NAME.fullmatch(name)
        if not match or name in keep:
            continue
        try:
            dt.datetime.strptime(match[1], "%Y%m%dT%H%M%SZ")
        except ValueError:
            continue
        rclone("purge", f"{DEST}/{name}")
    print("Encrypted Drive backup verified; retention complete", file=sys.stderr)


if __name__ == "__main__":
    main()
