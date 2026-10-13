"""Small, opt-in, localhost-only read workload for disposable PostgreSQL QA.

This is not a capacity benchmark. It creates one synthetic owner/room/occupancy
fixture, then runs five-second read-only stages at up to 50 and 100 workers.
Stages stop after 20,000 requests and refuse targets outside the local QA TLS port.
"""

from __future__ import annotations

import concurrent.futures
import http.cookiejar
import json
import math
import os
import secrets
import ssl
import sys
import threading
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter
from datetime import datetime
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo


STEADY_WINDOW_SECONDS = 5
MAX_STEADY_REQUESTS = 20_000
REQUEST_TIMEOUT_SECONDS = 5
STAGE_TIMEOUT_SECONDS = 25
WORKER_LEVELS = (50, 100)
QA_HOSTS = {"localhost", "127.0.0.1", "::1"}
QA_HTTPS_PORT = 18443


def require_environment() -> tuple[str, str, str]:
    base_url = os.environ.get("API_BASE_URL", "").rstrip("/")
    admin_email = os.environ.get("API_ADMIN_EMAIL", "")
    admin_password = os.environ.get("API_ADMIN_PASSWORD", "")
    if os.environ.get("API_LOAD_ALLOW_DISPOSABLE_POSTGRES") != "1":
        raise SystemExit("Set API_LOAD_ALLOW_DISPOSABLE_POSTGRES=1 only for the isolated disposable PostgreSQL QA API.")
    if not all((base_url, admin_email, admin_password)):
        raise SystemExit("Set API_BASE_URL, API_ADMIN_EMAIL, and API_ADMIN_PASSWORD from the disposable QA fixture.")
    parsed = urlsplit(base_url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in QA_HOSTS
        or parsed.port != QA_HTTPS_PORT
        or parsed.path not in ("", "/")
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise SystemExit(f"Refusing target: this harness allows only HTTPS localhost on port {QA_HTTPS_PORT}.")
    return base_url, admin_email, admin_password


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def build_opener(cookie_jar: http.cookiejar.CookieJar | None = None):
    # The QA reverse proxy uses an isolated Caddy internal CA. An optional
    # public CA certificate path can be passed via API_TLS_CA_FILE; TLS
    # verification stays enabled.
    handlers: list[object] = [
        NoRedirectHandler(),
        urllib.request.HTTPSHandler(context=ssl.create_default_context(cafile=os.environ.get("API_TLS_CA_FILE"))),
    ]
    if cookie_jar is not None:
        handlers.append(urllib.request.HTTPCookieProcessor(cookie_jar))
    return urllib.request.build_opener(*handlers)


def request_json(opener, base_url: str, path: str, method: str = "GET", payload=None, cookie: str = ""):
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
        headers["Origin"] = base_url
    if cookie:
        headers["Cookie"] = cookie
    request = urllib.request.Request(base_url + path, data=data, headers=headers, method=method)
    started = time.perf_counter()
    try:
        response = opener.open(request, timeout=REQUEST_TIMEOUT_SECONDS)
    except urllib.error.HTTPError as error:
        response = error
    except Exception as error:  # Do not print exception text; it may include a tokenized URL.
        return None, b"", (time.perf_counter() - started) * 1000, type(error).__name__
    status = response.code
    try:
        body = response.read()
    finally:
        response.close()
    elapsed_ms = (time.perf_counter() - started) * 1000
    return status, body, elapsed_ms, ""


def cookie_header(cookie_jar: http.cookiejar.CookieJar) -> str:
    return "; ".join(f"{cookie.name}={cookie.value}" for cookie in cookie_jar)


def percentile(samples: list[float], p: float) -> float:
    ordered = sorted(samples)
    return ordered[max(0, math.ceil(p * len(ordered)) - 1)]


def json_value(body: bytes):
    value = json.loads(body.decode("utf-8")) if body else None
    if isinstance(value, dict) and value.get("data") is not None:
        return value["data"]
    return value


def require_ok(opener, base_url: str, path: str, method: str = "GET", payload=None):
    status, body, _, error = request_json(opener, base_url, path, method, payload)
    if error or status is None or not 200 <= status < 300:
        raise SystemExit(f"Synthetic fixture setup failed on {method} {path}: HTTP {status or error}.")
    return json_value(body)


def create_synthetic_fixture(base_url: str, admin_email: str, admin_password: str) -> tuple[str, str]:
    admin_jar = http.cookiejar.CookieJar()
    admin_opener = build_opener(admin_jar)
    require_ok(admin_opener, base_url, "/api/auth/login", "POST", {"email": admin_email, "password": admin_password})

    suffix = uuid.uuid4().hex
    owner_email = f"load-qa-{suffix}@example.invalid"
    owner_password = f"LoadQA!{secrets.token_urlsafe(18)}Aa1"
    owner = require_ok(
        build_opener(),
        base_url,
        "/api/auth/register",
        "POST",
        {
            "name": f"Synthetic load QA {suffix[:8]}",
            "email": owner_email,
            "password": owner_password,
            "phone": f"09{int(suffix[:8], 16) % 100_000_000:08d}",
        },
    )
    require_ok(
        admin_opener,
        base_url,
        f"/api/admin/owners/{owner['id']}/status",
        "POST",
        {"status": "Approved", "reason": "Disposable PostgreSQL read-load fixture"},
    )

    owner_jar = http.cookiejar.CookieJar()
    owner_opener = build_opener(owner_jar)
    require_ok(owner_opener, base_url, "/api/auth/login", "POST", {"email": owner_email, "password": owner_password})
    building = require_ok(
        owner_opener,
        base_url,
        "/api/buildings",
        "POST",
        {"name": f"Load-QA-{suffix[:8]}", "address": "Synthetic disposable fixture"},
    )
    room = require_ok(
        owner_opener,
        base_url,
        "/api/rooms",
        "POST",
        {
            "buildingId": building["id"],
            "name": f"Load-{suffix[:8]}",
            "rent": 1_000_000,
            "electricityRate": 1_000,
            "waterFee": 0,
            "waterPerPerson": False,
            "serviceFee": 0,
            "initialReading": 100,
        },
    )
    require_ok(
        owner_opener,
        base_url,
        f"/api/rooms/{room['id']}/occupancy",
        "POST",
        {
            "tenantName": "Synthetic load tenant",
            "phone": "0900000000",
            "people": 1,
            "startDate": datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date().isoformat(),
            "depositAmount": 0,
        },
    )
    room_details = require_ok(owner_opener, base_url, f"/api/rooms/{room['id']}")
    if isinstance(room_details, dict) and isinstance(room_details.get("room"), dict):
        room_details = room_details["room"]
    occupancy = room_details.get("occupancy") if isinstance(room_details, dict) else None
    if not isinstance(occupancy, dict) or not occupancy.get("token"):
        raise SystemExit("Synthetic fixture setup completed but no tenant token was returned.")
    owner_cookie = cookie_header(owner_jar)
    if not owner_cookie:
        raise SystemExit("Synthetic owner login did not establish a session cookie.")
    return owner_cookie, occupancy["token"]


def run_steady_stage(name: str, base_url: str, path: str, workers: int, cookie: str = "") -> None:
    if workers not in WORKER_LEVELS:
        raise SystemExit("Worker count is outside the configured QA levels.")
    started = time.perf_counter()
    deadline = started + STEADY_WINDOW_SECONDS
    issue_lock = threading.Lock()
    result_lock = threading.Lock()
    issued = 0
    results = []

    def worker() -> None:
        nonlocal issued
        while time.perf_counter() < deadline:
            with issue_lock:
                if issued >= MAX_STEADY_REQUESTS:
                    return
                issued += 1
            result = request_json(build_opener(), base_url, path, "GET", None, cookie)
            with result_lock:
                results.append(result)

    executor = concurrent.futures.ThreadPoolExecutor(max_workers=workers)
    futures = [executor.submit(worker) for _ in range(workers)]
    done, pending = concurrent.futures.wait(futures, timeout=STAGE_TIMEOUT_SECONDS)
    if pending:
        for future in pending:
            future.cancel()
        executor.shutdown(wait=False, cancel_futures=True)
        raise SystemExit(f"{name}: exceeded {STAGE_TIMEOUT_SECONDS}s; remaining requests cancelled.")
    executor.shutdown(wait=True)
    elapsed = time.perf_counter() - started
    for future in done:
        future.result()
    statuses = Counter("error" if status is None else str(status) for status, _, _, _ in results)
    durations = [duration for _, _, duration, _ in results]
    errors = Counter(error for _, _, _, error in results if error)
    bytes_total = sum(len(body) for _, body, _, _ in results)
    http_429 = statuses.get("429", 0)
    print(
        f"{name}: requests={len(results)} concurrency={workers} target_s={STEADY_WINDOW_SECONDS} "
        f"duration_s={elapsed:.3f} "
        f"req_s={len(results) / elapsed:.1f} p50_ms={percentile(durations, .50):.1f} "
        f"p95_ms={percentile(durations, .95):.1f} http_429={http_429} statuses={dict(statuses)} "
        f"errors={dict(errors)} response_bytes={bytes_total}"
    )
    unexpected = {code: count for code, count in statuses.items() if code not in {"200", "429"}}
    if errors or unexpected:
        raise SystemExit(f"{name}: transport errors or unexpected HTTP statuses were observed.")


def main() -> None:
    base_url, admin_email, admin_password = require_environment()
    health_status, _, _, _ = request_json(build_opener(), base_url, "/api/health")
    if health_status != 200:
        raise SystemExit(f"QA API health preflight failed with HTTP {health_status}.")

    owner_cookie, guest_token = create_synthetic_fixture(base_url, admin_email, admin_password)

    # Confirm each read path once before the timed stages.
    owner_paths = ["/api/dashboard", "/api/rooms", "/api/buildings", "/api/invoices"]
    for path in owner_paths:
        status, _, _, _ = request_json(build_opener(), base_url, path, cookie=owner_cookie)
        if status != 200:
            raise SystemExit(f"Owner read preflight failed for {path} with HTTP {status}.")
    guest_path = f"/api/tenant/{guest_token}"
    guest_status, _, _, _ = request_json(build_opener(), base_url, guest_path)
    if guest_status != 200:
        raise SystemExit(f"Guest overview preflight failed with HTTP {guest_status}.")

    # A bounded steady guest-read workload avoids an artificial sub-second burst.
    for workers in WORKER_LEVELS:
        run_steady_stage(f"guest_overview_{workers}workers", base_url, guest_path, workers)
    print("This was a bounded local smoke load, not a capacity or users-per-second claim.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("Interrupted; no write workload was running.", file=sys.stderr)
        raise SystemExit(130)
