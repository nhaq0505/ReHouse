#!/usr/bin/env bash
set -euo pipefail

workspace_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
vps_host=${REHOUSE_VPS_HOST:?Set REHOUSE_VPS_HOST explicitly}
root_ssh_key=${REHOUSE_ROOT_SSH_KEY:?Set REHOUSE_ROOT_SSH_KEY explicitly}
deploy_public_key=${REHOUSE_CICD_PUBLIC_KEY:?Set REHOUSE_CICD_PUBLIC_KEY explicitly}
ssh_user=${REHOUSE_SSH_USER:-root}
remote_stage=/tmp/rehouse-provision-stage
staging_dir=$(mktemp -d)
staged_public_key=$staging_dir/rehouse_cicd_ed25519.pub
trap 'rm -rf -- "$staging_dir"' EXIT
cp -- "$deploy_public_key" "$staged_public_key"

for file in \
  "$workspace_root/deploy/compose.yaml" \
  "$workspace_root/deploy/migrate.yaml" \
  "$workspace_root/deploy/rehouse-db-roles.py" \
  "$workspace_root/deploy/rehouse-deploy.sh" \
  "$workspace_root/deploy/rehouse-backup.sh" \
  "$workspace_root/deploy/rehouse-restore.sh" \
  "$workspace_root/deploy/rehouse-ssh-command.sh" \
  "$workspace_root/deploy/rehouse-backup.service" \
  "$workspace_root/deploy/rehouse-backup.timer" \
  "$workspace_root/deploy/install-host.sh" \
  "$root_ssh_key" \
  "$staged_public_key"; do
  [[ -f "$file" ]] || { printf 'Missing required provisioning file.\n' >&2; exit 1; }
done

ssh -i "$root_ssh_key" -o BatchMode=yes "$ssh_user@$vps_host" "sudo -n install -d -o $ssh_user -g $ssh_user -m 0700 '$remote_stage'"
scp -q -i "$root_ssh_key" \
  "$workspace_root/deploy/compose.yaml" \
  "$workspace_root/deploy/migrate.yaml" \
  "$workspace_root/deploy/rehouse-db-roles.py" \
  "$workspace_root/deploy/rehouse-deploy.sh" \
  "$workspace_root/deploy/rehouse-backup.sh" \
  "$workspace_root/deploy/rehouse-restore.sh" \
  "$workspace_root/deploy/rehouse-ssh-command.sh" \
  "$workspace_root/deploy/rehouse-backup.service" \
  "$workspace_root/deploy/rehouse-backup.timer" \
  "$workspace_root/deploy/install-host.sh" \
  "$staged_public_key" \
  "$ssh_user@$vps_host":"$remote_stage/"

ssh -i "$root_ssh_key" -o BatchMode=yes "$ssh_user@$vps_host" \
  "sudo -n bash '$remote_stage/install-host.sh' \
    '$remote_stage/compose.yaml' \
    '$remote_stage/rehouse-deploy.sh' \
    '$remote_stage/rehouse-backup.sh' \
    '$remote_stage/rehouse-restore.sh' \
    '$remote_stage/rehouse-ssh-command.sh' \
    '$remote_stage/rehouse-backup.service' \
    '$remote_stage/rehouse-backup.timer' \
    '$remote_stage/rehouse_cicd_ed25519.pub' && rm -rf -- '$remote_stage'"
