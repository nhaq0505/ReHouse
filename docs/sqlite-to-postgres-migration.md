# SQLite → PostgreSQL: local cutover record and operating guide

Updated 13 October 2026. This documents the completed local move of the Rehouse Development API and the evidence collected. It is not a production deployment guide and does not establish an internet-facing or highly available topology. The concise handoff is in [PROJECT_HANDOFF.md, section 25](PROJECT_HANDOFF.md).

## Current state

- API: host process from `backend/RoomRental.Api`, Development environment, `http://localhost:5080`; frontend remains at `http://localhost:5173` and proxies `/api` to it.
- Database: PostgreSQL 17.11, database `room_rental`, Compose project `rehouse-pg-migration`, container `rehouse-pg-migration-db`, persistent volume `rehouse-pg-migration-data`. Host binding is `127.0.0.1:15432` only. The PG port is not published to the LAN or internet.
- App configuration selects `DatabaseProvider=Postgres`; `ConnectionStrings:DefaultConnection` points to the loopback target. `SeedDemo=false` prevents the Development seed from running. The real connection values are in an ignored mode-0600 file and are intentionally absent here.
- DataProtection uses the original API content root and its default key ring at `~/.aspnet/DataProtection-Keys`. The app was kept host-side so content-root-based application isolation and session/token protection remain stable. Preserve the key ring together with database backups.
- The original SQLite database was retained. The final pre-cutover snapshot is `backend/RoomRental.Api/.local-data/sqlite-to-postgres/room-rental-final-frozen-20261013.db`; the local PostgreSQL target is now authoritative. Do not point the app back at SQLite by changing only the provider setting.

The persistent PostgreSQL target can be inspected or started with:

```sh
./scripts/sqlite-to-postgres/start-target.sh
docker compose -f scripts/sqlite-to-postgres/compose.yaml -p rehouse-pg-migration ps
```

`start-target.sh` creates the ignored `backend/RoomRental.Api/.local-data/postgres-migration/postgres.env` with a random password on first use, restricts the file to mode 0600, and checks the expected container, volume, and loopback port before reusing them. Do not print, commit, copy into a ticket, or send the credential file. Keep the named volume; `docker compose down -v` would remove the database.

## Cutover evidence

The API was stopped gracefully during the final freeze and import. The frozen SQLite file passed `PRAGMA integrity_check` (`ok`) and `PRAGMA foreign_key_check` (0 violations). API downtime was approximately 2 minutes 30 seconds. The importer completed before the API was restarted, so no hosted job ran against a partially imported target.

A separate rehearsal had already imported the earlier immutable online backup into `room_rental_rehearsal`; the API was never started against that database. For the approved final cutover, the frozen snapshot was imported into the previously empty `room_rental` database. An independent typed read-only verifier compared every scalar field for every primary key in a repeatable-read PostgreSQL transaction before API startup:

Counts matched by table (SQLite = PostgreSQL): AuthSessions 93; Buildings 43; DepositSettlements 0; Invoices 32; Occupancies 45; PayOsAttempts 11; PaymentSettings 14; PaymentWebhookRegistrations 1; ProcessedWebhooks 5; Readings 32; Receipts 10; Rooms 45; Users 73. Total: 404 rows in each database.

There were no missing or extra rows and no scalar-field differences. GUIDs, decimals, dates, and `DateTimeOffset` values were normalized for provider representation (UTC instant at PostgreSQL microsecond precision). Data-level reference, uniqueness, idempotency, pending-attempt-per-invoice, and invoice-paid-equals-receipts checks had zero violations on both sides. Per-owner invoice, receipt, deposit, and payment-attempt aggregates had zero differences. Invoice total was 124,665,000 VND; invoice Paid and receipts each totaled 6,850,000 VND. Attempts were one Pending, five Paid, and five Failed.

Eighteen representative PostgreSQL column checks passed for UUID, numeric precision/scale, date, boolean, timestamp with time zone, bigint, and enum/string columns. The application entity model successfully read every row from both providers. With the cutover key-ring copy and the same content root/application discriminator, 38/38 protected tenant tokens unprotected and matched their stored token hashes; 14/14 PaymentSettings API/checksum key pairs unprotected on both sides, and their plaintext SHA-256 comparisons matched. Secret values, tokens, user IDs, emails, and cookies were not written to audit output.

After startup, backend reported an active PostgreSQL connection and no SQLite handle. Read-only API probes returned 200 for `/api/health` and for a tenant overview using an existing valid tenant link; that overview contained one invoice. Invoice and receipt counts/totals remained unchanged after startup. Normal reconciliation for the single existing Pending attempt stayed enabled; the migration verifier itself made no payOS request and sent no POST.

Owner-authenticated smoke could not be exercised: the existing Edge Rehouse tab was at `/login`, direct API navigation was blocked by the browser extension, and unauthenticated GETs to `/api/auth/me` and `/api/settings/payment` returned 401. No login or new session was created. Database row parity and successful DataProtection unprotect checks do not prove that any particular browser cookie is still active.

## Repeating a future migration safely

Treat these commands as a procedure for a separately approved migration to a fresh target. The final import command below was used once for the 13 October cutover; do not run it again against the current `room_rental` database. The guard confirms explicit approval but does not replace the required freeze, fresh-target check, and backup.

1. Identify the active provider, database file, API content root, and DataProtection key ring. Resolve a maintenance window and stop writes. Do not start the API or its hosted workers against the target until import and parity checks pass.
2. Start the persistent local PostgreSQL service with `./scripts/sqlite-to-postgres/start-target.sh`. Confirm that the target database is empty and that the PostgreSQL host port remains loopback-only. Keep the generated credential file mode 0600.
3. Create a consistent SQLite online backup while writes are frozen. Run `PRAGMA integrity_check` and `PRAGMA foreign_key_check` on the backup; keep the file and any key-ring/config backups access-restricted. Do not copy a live SQLite main file while ignoring its WAL.
4. Rehearse into the separate database using the same typed importer, then compare all rows and scalar fields, primary keys, FKs, financial totals and per-owner aggregates, uniqueness/idempotency constraints, provider-native column types, and DataProtection unprotectability. Do not start an API or hosted reconciliation worker against an imported database containing live provider credentials.

```sh
./scripts/sqlite-to-postgres/import.sh room_rental_rehearsal backend/RoomRental.Api/.local-data/sqlite-to-postgres/<consistent-snapshot>.db
```

5. For the actual cutover, stop the API gracefully, take a new frozen SQLite snapshot, verify it, and import only into the confirmed fresh final database. The one-time command used for this cutover was:

```sh
ROOMRENTAL_FINAL_IMPORT_APPROVED=YES ./scripts/sqlite-to-postgres/import.sh room_rental backend/RoomRental.Api/.local-data/sqlite-to-postgres/room-rental-final-frozen-20261013.db
```

6. Before app startup, create a protected PostgreSQL custom-format dump and verify its archive list. Restore that dump into a separate temporary database and compare table counts; do not test restore over the active target. Back up the DataProtection key ring at the same restore point. The cutover artifacts are `backend/RoomRental.Api/.local-data/postgres-migration/room_rental-pre-api-start-20261013.dump` (0600; archive listing had 58 entries; temporary restore verified 13 tables/404 rows) and `backend/RoomRental.Api/.local-data/sqlite-to-postgres/DataProtection-Keys-cutover-20261013/` (0700). The previous Development settings file is retained as `backend/RoomRental.Api/.local-data/sqlite-to-postgres/appsettings.Development.local.before-postgres-cutover-20261013.json` (0600).
7. Keep the app on the same host/content root and default key ring unless a separately tested DataProtection application name and key storage migration is planned. Set `DatabaseProvider=Postgres`, the protected local connection string, and `SeedDemo=false`. The host-side API command used after this import was:

```sh
cd backend/RoomRental.Api
ASPNETCORE_ENVIRONMENT=Development ASPNETCORE_URLS=http://localhost:5080 SeedDemo=false ./bin/Debug/net10.0/RoomRental.Api --urls http://localhost:5080
```

8. After startup, verify the PostgreSQL connection, read-only health, and an authorized owner/tenant read appropriate to the available session. Check the safe payment settings DTO without logging its body or credential-related values. Verify counts and financial totals again after standard startup jobs have run. Do not initiate checkout, reconcile manually, register a webhook, or send a fake callback as part of migration verification.

The importer is an operational cutover helper, not a versioned schema migration system. `DatabaseInitializer` still uses `EnsureCreated` plus conditional handwritten DDL at app startup; EF migration history and a regular restore drill are not in place. Validate future schema changes on a copy before deploying them.

## Backups and rollback delta

The following files are sensitive operational backups and remain under the ignored `.local-data` tree with restrictive permissions:

- `backend/RoomRental.Api/.local-data/sqlite-to-postgres/room-rental-baseline-20261013.db` — earlier consistent source copy used for rehearsal.
- `backend/RoomRental.Api/.local-data/sqlite-to-postgres/room-rental-final-frozen-20261013.db` — final source state immediately before cutover.
- `backend/RoomRental.Api/.local-data/postgres-migration/room_rental-pre-api-start-20261013.dump` — PostgreSQL target immediately before API startup.
- `backend/RoomRental.Api/.local-data/sqlite-to-postgres/DataProtection-Keys-cutover-20261013/` — protected key-ring copy paired with the cutover snapshot.
- `backend/RoomRental.Api/.local-data/sqlite-to-postgres/appsettings.Development.local.before-postgres-cutover-20261013.json` — prior local configuration.

These backups are not a continuous backup/point-in-time-recovery service. Keep PostgreSQL and DataProtection backups together and test restore on an isolated copy. Do not remove the original SQLite file or PostgreSQL volume as cleanup.

PostgreSQL is now authoritative. Once the app accepts a write, the frozen SQLite snapshot no longer contains that delta. If the app needs to be rolled back, stop writes, take a fresh PostgreSQL backup and matching key-ring backup, and enumerate/replay every post-cutover change before pointing the app to SQLite. There is no automated PostgreSQL→SQLite reverse importer. Fixing forward on PostgreSQL is safer than switching the connection string and silently losing new users, invoices, receipts, payment attempts, webhook idempotency records, or session revocations. Never infer a payment from a browser screenshot or provider status alone, and never delete an uncertain Pending attempt to clear a block.
