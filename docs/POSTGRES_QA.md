# PostgreSQL disposable QA report — 13/10/2026

This report records one bounded local run of the Production Docker image with PostgreSQL 17. It is evidence about this synthetic, cache-hot workload on one machine; it is not a production capacity estimate.

## Setup and safety boundaries

- The backend created a separately named Compose project, `rehouse-pg-qa`, with a fresh PostgreSQL volume, a disposable API, and a local Caddy TLS proxy. The API used `WebhookBaseUrl=http://localhost:18080`; no payOS endpoint or live webhook origin was contacted.
- The test client used `https://localhost:18443` and the project's isolated Caddy root certificate with TLS verification enabled. The load helper refuses any target except HTTPS localhost port 18443, requires an explicit disposable-PostgreSQL opt-in, has bounded request and stage timeouts, and caps each stage at 20,000 requests.
- The machine reported Darwin arm64, 12 logical CPUs, and 24 GiB RAM. Docker reported 12 CPUs and 7.65 GiB RAM. The QA containers had no per-container CPU or memory limit configured.
- Admin credentials lived only in a mode-0600 temporary fixture, were injected into the test process without printing them, and were deleted with the QA project. Test writes and the synthetic owner/building/room/occupancy existed only in the disposable database.

## Functional API checks

`python3 -m unittest discover -s tests -p 'test_api_integration.py' -v` passed **16/16 tests in 3.396 seconds** through the local TLS endpoint. The suite covered the existing API integration scenarios, including owner and tenant scope, invoices, deposits, moveout, meter readings and invalid webhook handling.

The PostgreSQL initializer created the schema and completed a repeated startup successfully. The seven nullable payment checkout metadata columns were present: `QrCode`, `AccountName`, `AccountNumber`, `BankBin`, `Description`, `ProviderStatus`, and `ExpiresAt`. The API TLS health preflight returned HTTP 200. The SQLite-only direct database fixture `test_payos_fixture.py` was not run against PostgreSQL; its schema/data setup is SQLite-specific. Existing fake `HttpClient` service tests and SQLite HTTP suite remain separate checks.

## Bounded read-only load

`tests/load_postgres_readonly.py` made a synthetic owner/building/room/occupancy through the QA API before timing. Each measured stage then performed only GETs to that tenant's overview endpoint; authentication and fixture creation were outside the timed windows. The harness used the standard-library urllib client and a fresh opener per request, so results include the local TLS proxy and connection setup costs.

| Workload | Requests | Duration | Throughput | p50 | p95 | HTTP 429 | Other statuses / transport errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 50 workers, 5-second target | 7,085 | 5.017 s | 1,412.3 req/s | 29.8 ms | 44.8 ms | 0 | 0; all responses were HTTP 200 |
| 100 workers, 5-second target | 7,078 | 5.051 s | 1,401.4 req/s | 57.3 ms | 92.0 ms | 0 | 0; all responses were HTTP 200 |

The throughput was nearly flat while p95 latency increased at 100 workers. This single-tenant, one-room, cache-hot local read workload does not establish a supported user count or production throughput. It did not measure writes, database growth, multi-tenant contention, external network behavior, or provider traffic. No checkout or payment was created.

## Teardown

After recording results, the backend removed only the `rehouse-pg-qa` containers, network, volume, uniquely tagged QA images, and `/tmp/rehouse-pg-qa` fixture directory. The shared Caddy image, unrelated `edusphere` container, live API, frontend, gateway, and tunnel were left unchanged. There is no remaining QA instance from this run.
