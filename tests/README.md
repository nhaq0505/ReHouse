# Local API integration tests

The suite uses only Python's standard library. It exercises the running HTTP
API and creates random test owners, buildings, rooms, and receipts in its
database. Run it against a disposable local Development database when possible.

Start the API with the demo seed explicitly enabled, then run:

```sh
ASPNETCORE_ENVIRONMENT=Development SeedDemo=true WebhookBaseUrl=http://localhost:5080 dotnet run \
  --project backend/RoomRental.Api --urls http://localhost:5080
python3 -m unittest discover -s tests -v
```

The demo admin defaults to `admin@phongtro.local` / `Admin123!`. Override the
API address and seeded admin credentials with `API_BASE_URL`,
`API_ADMIN_EMAIL`, and `API_ADMIN_PASSWORD` when needed. Mutating requests send
an `Origin` header equal to `API_BASE_URL`; set `API_ORIGIN` if the local server
allows a different development origin.

Keep `WebhookBaseUrl` set to an HTTP localhost URL for this isolated test server:
automatic confirmation rejects it before contacting payOS. Never run the fake-key
suite against an API configured with a real HTTPS callback origin.

The payOS test stores obviously unusable local credentials only to exercise
signature rejection. It sends no requests to payOS and does not create a
payment link.

An additional SQLite-only webhook replay fixture is opt-in. It inserts
synthetic payment attempts directly into the database used by the local
Development API, then posts signed test webhooks to that localhost API. Use a
disposable local Development database; never point `TEST_SQLITE_DB` at a
production or shared database. The API must be running against the same SQLite
file, and the fixture refuses non-local API URLs and mismatched database files.
It creates random owners and leaves no pending synthetic payment attempts.

For example, with the API using its default Development SQLite file:

```sh
TEST_SQLITE_DB="$(pwd)/backend/RoomRental.Api/.local-data/room-rental.db" \
API_BASE_URL=http://localhost:5080 \
python3 -m unittest discover -s tests -p 'test_payos_fixture.py' -v
```

The ordinary suite skips this fixture when `TEST_SQLITE_DB` is unset. The
fixture uses only synthetic credentials and never contacts payOS.

Webhook confirmation service tests use an in-memory SQLite database and fake HTTP handler;
they test success, persistence, provider rejection, timeout, malformed responses,
wrong callback URLs, credential/origin invalidation, and absence of financial receipts:

```sh
dotnet run --project tests/RoomRental.WebhookTests
```


Deposit coverage includes per-occupancy amount validation, zero deposit, separate monthly billing,
manual collection, held balance, refund/deduction, optional monthly debt credit, idempotency,
owner scope, moveout protection and signed deposit webhook replay. The full opt-in SQLite
suite currently has 15 tests. Use a disposable database, never the owner's live data.

Supplemental invoices add creation validation/scope, current occupancy checks, idempotent
creation, multiple items in the same month, guest/manual receipt and signed webhook replay
coverage. Full opt-in SQLite suite now contains 17 tests.

Moveout coverage adds final meter delta/idempotency/scope, zero total, monthly/supplemental
credits, pending payment block, full settlement completion, token revocation, safe replay after
new occupancy and the new meter baseline. Full opt-in SQLite suite: 20 tests.

## Inline payOS QR checkout (13/10/2026)

`dotnet run --project tests/RoomRental.WebhookTests` now includes an in-process fake
`HttpClient` payment suite. It checks signed QR/account/description/expiry persistence and
response mapping, pending-order reuse, legacy pending attempts with a nullable QR and saved
hosted URL, invalid signature/amount/order rejection, and webhook amount checks/idempotency.
It also verifies that provider `PAID` without a verified matching payment amount does not
create a receipt or credit an invoice. The handler only responds to fake payOS calls in
process; unexpected external calls fail the test. Latest result: 45 assertions passed
(11 webhook-registration and 34 checkout/payment assertions).

The opt-in HTTP API suite passed 20/20 against a disposable SQLite copy with
`WebhookBaseUrl=http://localhost:5082`; it did not call the live payOS origin. A separate
initializer check on another disposable copy confirmed SQLite integrity and unchanged row
counts while adding nullable checkout metadata columns. Do not use the live or shared DB for
these tests.

Browser QA uses a local synthetic-only mock server and CUA, not the live payOS service. The
original inline-modal pass covered QR rendering, QR-less legacy hosted fallback, suppression of
a non-payOS host, provider-paid versus authoritative invoice-paid behavior, and mobile
scrolling/no horizontal overflow at 375 px. The copy button showed its success toast, but
clipboard contents were not independently verified. The payload and all account details are
synthetic and non-payable. Historical modal screenshots are
`tests/artifacts/rehouse-inline-qr-desktop.jpg` and
`tests/artifacts/rehouse-inline-qr-mobile.jpg`.

The follow-up dedicated-page pass (13/10/2026) verified Pay navigation to
`/t/{token}/invoices/{id}/checkout?lang=en`, browser and in-page back navigation to the matching
portal URL, rendered synthetic QR, and the QR-less legacy fixture's explicit safe-host fallback
(the hosted link was not opened). A provider `paid` create response and reconcile response while
the invoice remained Unpaid kept the page waiting, hid QR/hosted checkout, and did not show
success. After the mock invoice itself became Paid, manual Check now showed Paid and
`Amount paid ₫425,000`. One route mount issued exactly one checkout request; reconciliation
requests were separate. At a 375×812 viewport the document/body widths stayed 375 px and the QR
SVG rendered; the desktop 1466 px viewport also had no horizontal overflow. The current route
screenshots are `tests/artifacts/rehouse-checkout-page-desktop.jpg` and
`tests/artifacts/rehouse-checkout-page-mobile.jpg`.

Only local in-memory mock data was changed; no live checkout, bank transfer, real invoice, or
production/shared database was touched. A direct hard refresh, expiry-state UI, and opening the
hosted fallback remain unverified. The latest frontend checks passed: production build (reported
by the frontend agent) and `npm run i18n:check` (554 keys × 4 catalogs).

## Disposable PostgreSQL Docker QA (13/10/2026)

The API integration suite also passed **16/16** against an isolated PostgreSQL 17 Production
Docker deployment over a local TLS proxy. The disposable project used an HTTP localhost
`WebhookBaseUrl`, so no payOS call was possible. This run did not use the SQLite-only direct DB
fixture `test_payos_fixture.py`; run that fixture only against a disposable SQLite DB as described
above. The PostgreSQL schema initializer and repeated startup succeeded, including the seven
nullable checkout metadata columns.

`load_postgres_readonly.py` is a bounded smoke-load helper, not a general benchmark. It requires
`API_LOAD_ALLOW_DISPOSABLE_POSTGRES=1`, accepts only `https://localhost:18443`, verifies TLS with
`API_TLS_CA_FILE`, creates synthetic fixture data before timing, and then runs only guest overview
GETs for 5 seconds at 50 and 100 workers. The project-specific TLS endpoint, CA certificate, and
admin credentials must come from a newly provisioned disposable QA environment; the former
temporary QA project and credentials have been removed. Never substitute a live API URL or
production credentials.

In that one run the 50-worker stage completed 7,085 reads in 5.017 seconds (1,412.3 req/s,
p50 29.8 ms, p95 44.8 ms) and the 100-worker stage completed 7,078 reads in 5.051 seconds
(1,401.4 req/s, p50 57.3 ms, p95 92.0 ms). Both had only HTTP 200 responses, no 429s, and no
transport errors. This was one cache-hot synthetic tenant on the local Docker host and does not
support a production capacity or user-count claim. See [`docs/POSTGRES_QA.md`](../docs/POSTGRES_QA.md)
for the workload, host limits, teardown, and interpretation.
