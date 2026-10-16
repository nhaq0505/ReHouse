# Rehouse pilot deployment

**Current state — 16 October 2026:** Roomie runs at https://roomie.io.vn. EF Core migrations are live for SQLite/PostgreSQL; the explicitly authorized one-time reset is complete and its reset hook was removed. Encrypted Google Drive backups run daily at03:00–03:20 Asia/Ho_Chi_Minh and before deployment. OAuth is In production, forced token refresh under systemd passed, and a downloaded/decrypted backup restored successfully in a disposable PostgreSQL17 container. See [migration record](ef-core-migrations.md), [backup/recovery record](backup-operations.md) and [remaining security debt](tech-debt-remediation-2026-10-16.md). See [the hardening release record](tech-debt-remediation-2026-10-16.md) for the latest release status. SSH administration now uses roomie-ops with sudo; root/password login is disabled.

The dated domain/pilot observations immediately below are historical checkpoints. Their row counts and pending payment state predate the authorized reset; do not use them as current database state.

**Live domain update — 14 October 2026:** primary URL is https://roomie.io.vn on116.118.3.40. P.A Việt Nam DNS has A @→116.118.3.40 and CNAME www→roomie.io.vn (TTL3600). Caddy has valid Let’s Encrypt certificates for both names; www redirects301 to the apex, HTTP redirects308 to HTTPS. The previous live hostname roomiedemo.duckdns.org continues proxying to the app to preserve existing guest links, payment returns and webhook callbacks. PUBLIC_BASE_URL/WEBHOOK_BASE_URL now use https://roomie.io.vn. Existing owner webhook registrations were not changed or tested with payOS; the old host still serves their callbacks. The older pilot notes below describe the original setup and use placeholder hostnames.

The app was recreated on its existing immutable image, without changing PostgreSQL or key volumes. Backup: /var/backups/rehouse/rehouse-20261014T110608Z-tKPjuH (database and DataProtection keys); previous Caddy/runtime config: /root/roomie-domain-before-20261014 (root-only). Public health on both hostnames200, apex login200, www301 and HTTP308 verified; Edge rendered the login page. Before/after:4 invoices, Total30000.00, Paid20000.00. This host now has1 PaymentSettings row and1 Pending payOS attempt; do not treat the original “fresh empty database” notes as current state. No payment was created, cancelled or manually reconciled during the domain change.

Updated 13 October 2026. The fresh VPS pilot is publicly reachable at [https://demo.yourdomain.com](https://demo.yourdomain.com). DNS resolves to `<YOUR_VPS_IP>`. Caddy 2.11.7, installed from its official Ubuntu package repository, serves a valid Let's Encrypt certificate and redirects HTTP to HTTPS with status 308. Public `/api/health` returned 200. Production admin sign-in, `/api/auth/me`, `/api/admin/owners`, Secure/HttpOnly cookie behavior, valid same-origin logout, and rejection of a bad-Origin logout were verified. The VPS database is still fresh: no tenant data, Mac database, or Mac payOS settings were imported; no payOS credentials, provider webhook registration, or payment has been configured or tested on this host.

## Host and access

The host runs Ubuntu 24.04 with Docker Engine, Compose, and Caddy's systemd service. The old `webphim` containers, images, volumes, Caddy state, backup files, deployment account, and its scheduled backup were removed after review. Ubuntu, SSH on port 22, Docker, containerd, and the QEMU guest agent remain installed. Caddy listens publicly on ports 80 and 443; its automatic HTTPS redirects plain HTTP. The app remains bound only to `127.0.0.1:8080`; PostgreSQL has no published port. Caddy's admin API is loopback-only on port 2019. Do not publish app port 8080 or PostgreSQL port 5432.

The Caddy site is defined in [`deploy/Caddyfile`](../deploy/Caddyfile) and proxies to `127.0.0.1:8080`. Caddy passes the request host and trusted forwarded headers to the app. The API sees Caddy's Docker bridge peer as `172.18.0.1`; the runtime trusts only that proxy address. The origin guard was verified through the public HTTPS endpoint with both a valid and invalid `Origin`.

The deployment account is `rehouse-deploy`. Its authorized key accepts only a command of this form:

```text
deploy ghcr.io/nhaq0505/rehouse@sha256:<64 lowercase hexadecimal characters>
```

The key cannot open a shell, allocate a terminal, forward ports, or use an agent/X11 tunnel. The wrapper validates the exact GHCR repository and digest before invoking the root-owned deployment helper through a single sudo rule. The Actions runner sends its package token on stdin; the helper creates a temporary Docker configuration under `/run`, pulls the immutable digest, and removes the credentials before starting the app. CI app deployments do not change the public origin or Caddy configuration.

The workflow requires the GitHub Actions secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PORT`, `DEPLOY_SSH_KEY`, and `DEPLOY_KNOWN_HOSTS`. Pin the server host key in `DEPLOY_KNOWN_HOSTS`; do not disable SSH host-key checking.

## Runtime configuration

`/etc/rehouse/runtime.env` is root-owned with mode `0600`. Its current public-facing values are:

| Key | Value or source |
| --- | --- |
| `DB_PASSWORD` | Generated on the VPS; keep secret |
| `BOOTSTRAP_ADMIN_EMAIL` | `admin@rehouse.local`; production login was tested |
| `BOOTSTRAP_ADMIN_PASSWORD` | Generated on the VPS; initial value is also stored in `/root/rehouse-bootstrap-credentials`, mode `0600` |
| `PUBLIC_BASE_URL` | `https://demo.yourdomain.com` |
| `WEBHOOK_BASE_URL` | `https://demo.yourdomain.com` |
| `TRUSTED_PROXIES` | `172.18.0.1`, the Rehouse Docker bridge gateway observed by the API |

The provisioner and origin-update helper do not print secret values or save them in the workspace. Docker exposes configured environment values to host root through container inspection, so keep root access restricted. The CI token is never stored on the VPS.

PostgreSQL has no published port, and the app remains bound to `127.0.0.1:8080`. Caddy is the only public ingress. Its automatic HTTPS behavior issues and renews the certificate and redirects HTTP; do not configure an HTTP site for login or payments. The webhook origin is ready to generate public callback URLs at `/api/payments/webhook/{ownerId}`, but the fresh VPS database has no owner payment settings. No payOS `confirm-webhook`, real checkout, or payment has been performed.

## Install and operate public ingress

Caddy was installed from the [official Caddy Ubuntu/Debian package repository](https://caddyserver.com/docs/install). The Caddyfile uses Caddy's automatic HTTPS and `reverse_proxy` behavior; see the [official reverse-proxy documentation](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy). To reproduce the current setup, first install Caddy from that official package source, then stage the reviewed Caddyfile and helper on the host. The helper verifies DNS, derives the current Docker bridge gateway, takes a database plus DataProtection-key backup, updates the three public-origin settings, recreates the app on its current digest, and checks health, PostgreSQL, the bootstrap admin, and key-volume ownership:

```sh
scp -i /path/to/root-ssh-key -P 22 -o StrictHostKeyChecking=yes \
  deploy/Caddyfile deploy/configure-public-origin.sh root@<YOUR_VPS_IP>:/root/
ssh -i /path/to/root-ssh-key -p 22 -o StrictHostKeyChecking=yes root@<YOUR_VPS_IP> \
  'install -o root -g root -m 0644 /root/Caddyfile /etc/caddy/Caddyfile && bash /root/configure-public-origin.sh demo.yourdomain.com <YOUR_VPS_IP>'
```

The helper serializes its work with deployments and backups. It does not install Caddy or change firewall policy. Confirm external reachability of TCP ports 80/443 when provisioning another host. Check the service/config and public behavior with:

```sh
systemctl status caddy
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
journalctl -u caddy --since today
curl --fail https://demo.yourdomain.com/api/health
curl --silent --show-error --output /dev/null --write-out '%{http_code} %{redirect_url}\n' \
  http://demo.yourdomain.com/api/health
```

Expected responses are health 200 and an HTTP 308 redirect to HTTPS. For a local-only application check, `curl --fail http://127.0.0.1:8080/api/health` is still available over SSH.

## Resource limits and persistent data

The pilot fits the 2 vCPU / 2 GB RAM host with a 1 GB swap file and `vm.swappiness=10`. Compose caps the app at 640 MB and 1.25 CPU, PostgreSQL at 384 MB and 0.65 CPU, and PostgreSQL uses 20 connections with modest shared buffers and work memory. Both containers use bounded JSON logs (10 MB × 3 files). The app has a read-only root filesystem and a separate persistent DataProtection volume.

The named volumes are `rehouse_postgres_data` and `rehouse_data_protection_keys`. Backup sets in `/var/backups/rehouse` contain a PostgreSQL custom dump, DataProtection archive, manifest with creation time/image digest, and SHA256 checksums. The newest10local sets are kept. The daily timer runs03:00Asia/Ho_Chi_Minh with up to20minutes jitter; deployment and public-origin changes use the same helper before replacing the app. The helper reads root-managed runtime.env and then optional `/etc/rehouse/backup.env`; the live hook calls `rehouse-drive-sync` to upload via rclone crypt and download/decrypt-check all files before remote retention. Google Drive retains the newest snapshot per selected7days/4ISOweeks/3months. A failed off-site operation retains the completed local set, returns failure and blocks the deployment's app swap. OAuth/config/recovery locations and a tested restore procedure are documented in [Google Drive backup](backup-operations.md).

Production checks pending migrations without applying them at startup. The deploy helper first runs the one-shot migration overlay using the ownership role, reapplies restricted runtime grants, then swaps the app image. The app uses roomie_app with DML permissions, not the migration or DBA identity. Keep future changes backward-compatible and additive. See [migration workflow](ef-core-migrations.md). The deploy helper checks `/api/health`, a live PostgreSQL query, the bootstrap admin row, and key-volume ownership. If a candidate image fails, it restores the previous app digest and leaves PostgreSQL untouched. If a new schema is incompatible with the old image, explicitly restore the matching database and key backup. For an off-site snapshot, download/decrypt and verify SHA256 into a private local backup directory first. Restore builds and validates a separate database first, then swaps it into place while the app is stopped; the prior database and key volume remain available until the restored app passes its smoke checks. Restore replaces current database contents:

```sh
sudo /usr/local/sbin/rehouse-restore /var/backups/rehouse/rehouse-<timestamp>-<suffix> --replace-current-data
```

The restore helper uses the image digest recorded in the backup manifest. Preserve backups until the restored app passes its health check and the data has been reviewed.

If a first deployment fails after creating PostgreSQL tables but before writing a DataProtection key, the backup helper refuses to create a keyless backup. Recover only while the pilot is still empty: restore the pre-deploy backup from that first attempt with the command above. It contains the zero-table database and empty key directory; the restored app then initializes the schema and bootstrap admin again. Do not bypass this guard or use that empty backup after tenant data has been entered.

## Provision and operate the host

From the workspace, provision a new host after reviewing the scripts. Pass all target paths explicitly; the provisioner has no default VPS or SSH-key path. It uses the existing root SSH key and copies only the public CI deployment key:

```sh
REHOUSE_VPS_HOST=<YOUR_VPS_IP> \
REHOUSE_ROOT_SSH_KEY=/path/to/root-ssh-key \
REHOUSE_CICD_PUBLIC_KEY=/path/to/rehouse-cicd.pub \
  deploy/provision-vps.sh
```

The initial install creates the restricted deployment user, root-owned Compose/helpers, generated runtime secrets, a daily backup timer, and the1GB swap file. A new host also needs the Drive sync helper, rclone OAuth/crypt configuration, recovery keys and static OAuth disclosure pages installed separately using [the backup setup record](backup-operations.md); the provisioner does not install those automatically. Use disposable environments for mutating QA; production checks should be read-only unless a specific operation is authorized. Do not expose port8080 directly.

Useful host commands:

```sh
systemctl status rehouse-backup.timer
systemctl start rehouse-backup.service
curl --fail http://127.0.0.1:8080/api/health
docker compose --project-name rehouse --env-file /etc/rehouse/runtime.env -f /opt/rehouse/compose.yaml ps
```

Run Docker commands as root. Do not run `docker compose down -v`, `docker volume prune`, or a broad Docker prune on this host.
