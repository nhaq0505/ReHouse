# MFA removal — 16/10/2026

User explicitly requested removal of the entire two-factor feature. Email/password remains the login mechanism for owners and admins, including accounts whose stored legacy MFA flag is true.

## Changes

Removed the login code input, enrollment UI/route, backend service, setup/confirm DTOs/endpoints and admin enrollment gate. Login `code` remains accepted and ignored; `mfaEnabled`/`mfaRequired` always return false. Old MFA database fields and migrations remain intact. No OTP registration, password recovery or business-data change.

## Verification

- Frontend production build: PASS; i18n check: 1034 keys across four catalogs PASS; bounded invoice API regression PASS.
- Backend Release service suite: PASS (207 PASS log entries), including DTO compatibility and persisted-session admin middleware for both legacy MFA states.
- Disposable SQLite HTTP: 76/76 PASS, zero skips. Includes password-only login for legacy enabled/disabled rows, ignored code, false compatibility flags, bad password rejection, admin access, logout and setup/confirm 404.
- Disposable OTP: 10/10 PASS, zero skips, with a loopback SMTP sink.
- Playwright: 8/8 PASS, including login without code input, admin access with stale flags, removed enrollment URL, session expiry/retry/race, pagination and old-invoice checkout.
- EF pending-model checks: SQLite and PostgreSQL both report no changes since the last migration.
- `git diff --check`: PASS.

All mutating checks used disposable fixtures with synthetic providers. No production mutation, live email or real payment. PostgreSQL HTTP/service suites were not rerun in this task; the database model is unchanged. Browser tests use mocked API responses; real endpoint behavior is covered separately by HTTP tests.

## Release

User authorized pushing this change to main together with the password-policy and auth-navigation updates. Local verification passed; CI/CD must confirm build, publication and deployment. See [Actions](https://github.com/nhaq0505/ReHouse/actions) for release status.
