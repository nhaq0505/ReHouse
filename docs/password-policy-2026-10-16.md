# Password policy update — 16/10/2026

User requested passwords longer than eight characters without complexity requirements. The minimum is9, the existing maximum256 remains, whitespace-only input is invalid, and confirmation still matches where required. Existing credentials are preserved.

## Implementation

One backend predicate is shared by new-password validation and initial admin bootstrap. Registration, email OTP registration, change and reset use the same rule. UI validation/hints and four generated translation catalogs were updated. Current-password verification, hashes, revocation and rate limits remain unchanged.

## Validation

- Backend Release service suite: PASS (212 PASS entries), including length/composition boundaries and confirmation mismatch.
- Disposable SQLite HTTP:76/76 PASS, zero skips; includes simple lowercase registration/change and numeric reset with existing session/token checks.
- Disposable OTP:10/10 PASS, zero skips; nine lowercase characters survive registration, verification and login.
- Playwright:9/9 PASS; eight-character reset rejected before POST, nine lowercase characters accepted.
- Frontend build and i18n check: PASS (1034keys across four catalogs).
- `git diff --check`: PASS.

All mutating automated tests used disposable data and fake services; no live email/payment or production database mutation. PostgreSQL suites were not rerun in this task. Local API restarted with the updated Release build; frontend proxy health returned200 at http://127.0.0.1:5173/api/health. Local invoice/reconciliation jobs and real email delivery remain disabled.

## Release

User authorized pushing this change to main with MFA removal and auth-page home links. Local verification passed; publication/deployment status comes from [CI/CD](https://github.com/nhaq0505/ReHouse/actions).
