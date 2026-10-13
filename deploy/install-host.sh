#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH
umask 077

fail() {
  printf 'install-host: %s\n' "$1" >&2
  exit 1
}

[[ "$EUID" -eq 0 ]] || fail 'must run as root'
[[ "$#" -eq 8 ]] || fail 'usage: install-host.sh COMPOSE DEPLOY_HELPER BACKUP_HELPER RESTORE_HELPER SSH_WRAPPER BACKUP_SERVICE BACKUP_TIMER PUBLIC_KEY'

compose_source=$1
deploy_source=$2
backup_source=$3
restore_source=$4
ssh_wrapper_source=$5
backup_service_source=$6
backup_timer_source=$7
public_key_source=$8
[[ -n "$public_key_source" ]] || fail 'public deployment key path is required'
[[ -f "$compose_source" && -f "$deploy_source" && -f "$backup_source" && -f "$restore_source" && -f "$ssh_wrapper_source" && -f "$backup_service_source" && -f "$backup_timer_source" && -f "$public_key_source" ]] || fail 'one or more staged files are missing'

command -v docker >/dev/null 2>&1 || fail 'Docker is not installed'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose plugin is not installed'
command -v curl >/dev/null 2>&1 || fail 'curl is required for the loopback health check'
command -v openssl >/dev/null 2>&1 || fail 'OpenSSL is required to generate secrets'
command -v python3 >/dev/null 2>&1 || fail 'Python 3 is required to generate the initial administrator password'
command -v sudo >/dev/null 2>&1 || fail 'sudo is required for the restricted deploy account'
command -v flock >/dev/null 2>&1 || fail 'flock is required to serialize backup, deploy, and restore operations'

install -d -o root -g root -m 0750 /opt/rehouse
install -d -o root -g root -m 0700 /etc/rehouse /var/lib/rehouse /var/backups/rehouse
if [[ ! -e /var/lib/rehouse/ops.lock ]]; then
  install -o root -g root -m 0600 /dev/null /var/lib/rehouse/ops.lock
fi
install -o root -g root -m 0644 "$compose_source" /opt/rehouse/compose.yaml
install -o root -g root -m 0750 "$deploy_source" /usr/local/sbin/rehouse-deploy
install -o root -g root -m 0750 "$backup_source" /usr/local/sbin/rehouse-backup
install -o root -g root -m 0750 "$restore_source" /usr/local/sbin/rehouse-restore
install -d -o root -g root -m 0755 /usr/local/libexec
install -o root -g root -m 0755 "$ssh_wrapper_source" /usr/local/libexec/rehouse-ssh-command
install -o root -g root -m 0644 "$backup_service_source" /etc/systemd/system/rehouse-backup.service
install -o root -g root -m 0644 "$backup_timer_source" /etc/systemd/system/rehouse-backup.timer

if ! id rehouse-deploy >/dev/null 2>&1; then
  temporary_password=$(openssl rand -base64 48)
  password_hash=$(printf '%s' "$temporary_password" | openssl passwd -6 -stdin)
  unset temporary_password
  useradd --create-home --shell /bin/bash --password "$password_hash" rehouse-deploy
  unset password_hash
fi
usermod --shell /bin/bash rehouse-deploy
install -d -o rehouse-deploy -g rehouse-deploy -m 0700 /home/rehouse-deploy/.ssh

read -r key_type key_data key_comment < "$public_key_source" || fail 'deployment public key is invalid'
[[ "$key_type" == ssh-ed25519 && -n "$key_data" ]] || fail 'expected an ssh-ed25519 deployment public key'
printf 'restrict,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty,command="/usr/local/libexec/rehouse-ssh-command" %s %s %s\n' \
  "$key_type" "$key_data" "${key_comment:-rehouse-cicd}" > /home/rehouse-deploy/.ssh/authorized_keys
chown rehouse-deploy:rehouse-deploy /home/rehouse-deploy/.ssh/authorized_keys
chmod 0600 /home/rehouse-deploy/.ssh/authorized_keys

cat > /etc/sudoers.d/rehouse-deploy <<'SUDOERS'
rehouse-deploy ALL=(root) NOPASSWD: /usr/local/sbin/rehouse-deploy
SUDOERS
chmod 0440 /etc/sudoers.d/rehouse-deploy
visudo -cf /etc/sudoers.d/rehouse-deploy >/dev/null || fail 'sudoers validation failed'

cat > /etc/ssh/sshd_config.d/90-rehouse-deploy.conf <<'SSHD'
Match User rehouse-deploy
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
    PermitTTY no
    PermitUserRC no
    ForceCommand /usr/local/libexec/rehouse-ssh-command
Match all
SSHD
chmod 0644 /etc/ssh/sshd_config.d/90-rehouse-deploy.conf
sshd -t || fail 'sshd configuration validation failed'
systemctl reload ssh
systemctl daemon-reload
systemctl enable --now rehouse-backup.timer >/dev/null

if [[ ! -e /etc/rehouse/runtime.env ]]; then
  db_password=$(openssl rand -hex 32)
  admin_password=$(python3 - <<'PY'
import secrets
import string

symbols = "!@%+=._-"
alphabet = string.ascii_letters + string.digits + symbols
password = [secrets.choice(string.ascii_uppercase), secrets.choice(string.ascii_lowercase), secrets.choice(string.digits), secrets.choice(symbols)]
password.extend(secrets.choice(alphabet) for _ in range(28))
secrets.SystemRandom().shuffle(password)
print("".join(password))
PY
)
  {
    printf 'DB_PASSWORD=%s\n' "$db_password"
    printf 'BOOTSTRAP_ADMIN_EMAIL=admin@rehouse.local\n'
    printf 'BOOTSTRAP_ADMIN_PASSWORD=%s\n' "$admin_password"
    printf 'PUBLIC_BASE_URL=http://localhost:8080\n'
    printf 'WEBHOOK_BASE_URL=http://localhost:8080\n'
    printf 'TRUSTED_PROXIES=\n'
  } > /etc/rehouse/runtime.env
  chmod 0600 /etc/rehouse/runtime.env
  {
    printf 'email=admin@rehouse.local\n'
    printf 'password=%s\n' "$admin_password"
  } > /root/rehouse-bootstrap-credentials
  chmod 0600 /root/rehouse-bootstrap-credentials
  unset db_password admin_password
fi

if ! swapon --show=NAME --noheadings | grep -Fxq /swapfile; then
  if [[ ! -e /swapfile ]]; then
    fallocate -l 1G /swapfile
    chmod 0600 /swapfile
    mkswap /swapfile >/dev/null
  fi
  swapon /swapfile
fi
if ! grep -qE '^[[:space:]]*/swapfile[[:space:]]' /etc/fstab; then
  printf '/swapfile none swap sw 0 0\n' >> /etc/fstab
fi
printf 'vm.swappiness=10\n' > /etc/sysctl.d/99-rehouse-swap.conf
sysctl -q -p /etc/sysctl.d/99-rehouse-swap.conf

chown root:root /etc/rehouse/runtime.env
chmod 0600 /etc/rehouse/runtime.env
if [[ -e /root/rehouse-bootstrap-credentials ]]; then
  chown root:root /root/rehouse-bootstrap-credentials
  chmod 0600 /root/rehouse-bootstrap-credentials
fi
chown -R root:root /opt/rehouse /var/lib/rehouse /var/backups/rehouse
chmod 0750 /opt/rehouse
chmod 0700 /etc/rehouse /var/lib/rehouse /var/backups/rehouse

printf 'Rehouse host files installed. Generated secrets are stored in root-only files and were not printed.\n'
