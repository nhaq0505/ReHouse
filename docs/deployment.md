# Rehouse pilot deployment

Updated 13 October 2026. The VPS pilot is a fresh, isolated deployment on `<YOUR_VPS_IP>`; it does not import the Mac database or its payment settings.

## Host and access

The host runs Ubuntu 24.04 with Docker Engine and the Compose plugin already installed. The old `webphim` containers, images, volumes, Caddy state, backup files, deployment account and its scheduled backup were removed after review. Ubuntu, SSH on port 22, Docker, containerd and the QEMU guest agent remain installed and active. Ports 80 and 443 are free.

The deployment account is `rehouse-deploy`. Its authorized key accepts only a command of this form:

```text
deploy ghcr.io/nhaq0505/rehouse@sha256:<64 lowercase hexadecimal characters>
```

The key cannot open a shell, allocate a terminal, forward ports, or use an agent/X11 tunnel. The wrapper validates the exact GHCR repository and digest before invoking the root-owned deployment helper through a single sudo rule. The Actions runner sends its package token on stdin; the helper creates a temporary Docker configuration under `/run`, logs into GHCR, pulls the digest, and removes the credentials before starting the app.

The GitHub workflow builds the image. The VPS only pulls an immutable digest and starts it. Production Compose and helper files live under `/opt/rehouse` and `/usr/local`; runtime secrets live in `/etc/rehouse/runtime.env` with root-only permissions.

## Runtime configuration

`/etc/rehouse/runtime.env` contains these keys:

| Key | Value or source |
| --- | --- |
| `DB_PASSWORD` | Generated on the VPS; 64 hexadecimal characters |
| `BOOTSTRAP_ADMIN_EMAIL` | `admin@rehouse.local` for internal pilot QA |
| `BOOTSTRAP_ADMIN_PASSWORD` | Generated on the VPS; initial value is also stored in `/root/rehouse-bootstrap-credentials`, mode `0600` |
| `PUBLIC_BASE_URL` | `http://localhost:8080` until a domain and HTTPS endpoint are configured |
| `WEBHOOK_BASE_URL` | `http://localhost:8080` until a public HTTPS webhook endpoint exists |
| `TRUSTED_PROXIES` | Empty until an actual reverse proxy is installed |

The values are generated or written on the VPS. The provisioner does not print them or save them in the workspace. Docker exposes configured environment values to host root through container inspection, so keep root access restricted. The CI token is never stored on the VPS.

PostgreSQL has no published port. The app binds only to `127.0.0.1:8080`; no public HTTP login or payment flow is available. For internal QA, use an SSH tunnel and open `http://localhost:8080` in a local browser:

```sh
ssh -i /path/to/root-ssh-key -L 8080:127.0.0.1:8080 root@<YOUR_VPS_IP>
```

The generated internal admin password is only readable by root on the VPS. The `localhost` webhook origin cannot receive public payOS callbacks; configure a domain, HTTPS reverse proxy and exact proxy IPs before testing payments or accepting tenant traffic. Do not expose port 8080 directly or use public plain HTTP for login or payments.

## Resource limits and persistent data

The pilot fits the 2 vCPU / 2 GB RAM host with a 1 GB swap file and `vm.swappiness=10`. Compose caps the app at 640 MB and 1.25 CPU, PostgreSQL at 384 MB and 0.65 CPU, and PostgreSQL uses 20 connections with modest shared buffers and work memory. Both containers use bounded JSON logs (10 MB × 3 files). The app has a read-only root filesystem and a separate persistent DataProtection volume.

The named volumes are `rehouse_postgres_data` and `rehouse_data_protection_keys`. Backups are written to `/var/backups/rehouse` and contain a PostgreSQL custom-format dump, a DataProtection key archive, the creation time and the image digest. A systemd timer makes a daily backup; deployment also creates a backup before each app replacement. The newest 10 backup sets are kept on the same VPS. These local backups do not protect against loss of the VPS or its disk; copy them off-host before treating the pilot as the only copy of business data.

The current API initializes PostgreSQL with `EnsureCreated` plus additive SQL changes; there is no complete versioned migration system yet. Keep future schema changes backward-compatible and additive. The deploy helper checks `/api/health`; if the candidate fails, it restores the previous app digest and leaves PostgreSQL untouched. If a new schema is incompatible with the old image, restore the matching database and key backup explicitly. Restore replaces current database contents:

```sh
sudo /usr/local/sbin/rehouse-restore /var/backups/rehouse/rehouse-<timestamp>-<suffix> --replace-current-data
```

The restore helper uses the image digest recorded in the backup manifest. Preserve backups until the restored app passes its health check and the data has been reviewed.

## Provision and operate

From the workspace, provision the host after reviewing the scripts. It uses the existing root SSH key and copies only the public CI deployment key:

```sh
deploy/provision-vps.sh
```

The initial install creates the restricted deployment user, root-owned Compose/helpers, generated runtime secrets, a daily backup timer and the 1 GB swap file. It does not start the app; the first successful GitHub Actions deployment creates the fresh PostgreSQL database and initial admin.

Useful host commands:

```sh
systemctl status rehouse-backup.timer
systemctl start rehouse-backup.service
curl --fail http://127.0.0.1:8080/api/health
docker compose --project-name rehouse --env-file /etc/rehouse/runtime.env -f /opt/rehouse/compose.yaml ps
```

Run Docker commands as root. Do not run `docker compose down -v`, `docker volume prune`, or a broad Docker prune on this host.
