# Project: Roomie Automated Testing Ecosystem

## Architecture
Hệ thống Roomie là nền tảng quản lý nhà trọ và căn hộ dịch vụ gồm 3 thành phần chính:
1. **Backend API**: ASP.NET Core `net10.0` Minimal APIs với EF Core (`AppDbContext`), hỗ trợ dual SQLite và PostgreSQL. Sử dụng `EphemeralDataProtectionProvider` cho môi trường kiểm thử.
2. **C# Test Runner (`tests/RoomRental.WebhookTests`)**: Console executable (`<OutputType>Exe</OutputType>`) sử dụng `Microsoft.AspNetCore.TestHost` và In-Memory SQLite (`Data Source=:memory:`), kiểm thử in-process toàn bộ service và HTTP endpoint.
3. **Python Integration Suite (`tests/`)**: 11 module unittest với 93 test methods, chạy qua disposable test harness (`run_disposable.py`) với database SQLite tạm thời trong `/tmp/roomie-ci-*`, network proxy blackholing (`127.0.0.1:9`), và mock SMTP sink trên loopback (`127.0.0.1:5098`).
4. **Frontend E2E Suite (`frontend/e2e/`)**: Playwright kiểm thử giao diện người dùng dựa trên bản build tĩnh (`vite preview` trên `127.0.0.1:4178`), sử dụng native route interception (`page.route('**/api/**', ...)` và `context.route('https://pay.payos.vn/**', ...)`) đảm bảo độc lập, không phụ thuộc database và 100% không gửi request ra Internet.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1.1 OTP Email Registration | Luồng đăng ký mã OTP 6 số, challenge token 64 ký tự, hash token, hết hạn 10 phút, khóa sau 5 lần sai, cooldown 60s, giới hạn 5 lần/giờ. | M1, M2 | ORIGINAL_REQUEST §R1 |
| 2 | R1.2 Password Policy | Chính sách mật khẩu 9-256 ký tự, từ chối <=8 ký tự hoặc whitespace, không ép buộc ký tự đặc biệt giả tạo. | M1, M2, M3 | ORIGINAL_REQUEST §R1 |
| 3 | R1.3 Session Revocation | Đổi mật khẩu/đặt lại mật khẩu thu hồi phiên đăng nhập trên các thiết bị khác trong DB `AuthSessions`, middleware từ chối HTTP 401 ngay lập tức. | M1, M2 | ORIGINAL_REQUEST §R1 |
| 4 | R1.4 Rate Limiting & CSRF | Rate limiting IP và email login throttle; CSRF/Origin enforcement kiểm tra Origin/Referer header trên mọi mutating HTTP method. | M1, M2 | ORIGINAL_REQUEST §R1 |
| 5 | R2.1 Hostel & Room CRUD | CRUD dãy trọ, phòng trọ; soft-archive cascade xuống phòng; khôi phục dãy trọ; chặn xóa khi có khách/hóa đơn chưa quyết toán. | M1, M2, M3 | ORIGINAL_REQUEST §R2 |
| 6 | R2.2 Multi-tenant Landlord Isolation | Cô lập tuyệt đối giữa các chủ trọ: Chủ trọ A không thể đọc/sửa/xóa dãy trọ, phòng trọ, hóa đơn của Chủ trọ B. | M1, M2 | ORIGINAL_REQUEST §R2 |
| 7 | R2.3 Free Tier Room Quota | Giới hạn 5 phòng cho gói Free (`FreeTierMaxRooms = 5`); trả về 403 khi vượt quá; mở khóa không giới hạn khi nâng cấp Pro. | M1, M2, M3 | ORIGINAL_REQUEST §R2 |
| 8 | R2.4 Water Calculation by Snapshot | Tiền nước tính theo snapshot số người ở tại thời điểm chốt chỉ số, không bị thay đổi hồi tố khi số người cập nhật sau đó. | M1, M2 | ORIGINAL_REQUEST §R2 |
| 9 | R2.5 Deposit Ledger Management | Quản lý tiền cọc: Hoàn cọc (Refund) và Khấu trừ vào công nợ (Deduction), kiểm tra version concurrency và idempotency key. | M1, M2 | ORIGINAL_REQUEST §R2 |
| 10 | R2.6 Move-out Settlement | Quyết toán trả phòng: Kiểm tra sạch nợ, hoàn/giữ cọc, khóa token khách thuê, và tự động nâng `InitialReading` lên `MeterBaselineAsync` chống lùi số. | M1, M2 | ORIGINAL_REQUEST §R2 |
| 11 | R3.1 Meter Reading Anti-Regression | Chống lùi số điện/nước: `CurrentReading >= previousReading`, kiểm tra thứ tự tháng, không ghi chỉ số lùi về quá khứ. | M1, M2, M3 | ORIGINAL_REQUEST §R3 |
| 12 | R3.2 Invoice Generation & Supplemental | Tự động tính tiền thuê, điện, nước, dịch vụ; hỗ trợ lập hóa đơn bổ sung độc lập và chỉnh sửa hóa đơn kèm audit revision. | M1, M2, M3 | ORIGINAL_REQUEST §R3 |
| 13 | R3.3 Idempotent Cash Collection | Ghi nhận thu tiền mặt một phần/toàn phần có chống trùng lặp (`IdempotencyKey`), kiểm tra `ExpectedVersion`, tự động hủy link payOS đang chờ. | M1, M2, M3 | ORIGINAL_REQUEST §R3 |
| 14 | R3.4 Excel Report Export | Xuất báo cáo Thu tiền, Công nợ, Tiền cọc dạng ClosedXML XLSX chuẩn, 2 sheet (Tổng hợp & Chi tiết), format tiền tệ, chống chèn mã độc công thức (quotePrefix). | M1, M2 | ORIGINAL_REQUEST §R3 |
| 15 | R4.1 payOS Payment Link & QR | Tạo link thanh toán payOS thời hạn 600s, tái sử dụng attempt đang chờ, sinh mã đơn hàng, hiển thị VietQR. | M1, M2, M3 | ORIGINAL_REQUEST §R4 |
| 16 | R4.2 HMAC Webhook Verification | Xác thực chữ ký số HMAC-SHA256 theo thứ tự key ASCII của payOS, kiểm tra mã lỗi "00", số tiền, đúng chủ trọ, chống replay qua `ProcessedWebhooks`. | M1, M2 | ORIGINAL_REQUEST §R4 |
| 17 | R4.3 Cash vs Online Conflict | Xử lý xung đột khi tiền mặt và online thanh toán đồng thời: ưu tiên thanh toán online đã thành công, hủy link payOS khi thu tiền mặt an toàn. | M1, M2 | ORIGINAL_REQUEST §R4 |
| 18 | R4.4 Automated Reconciliation Sweep | Quét đối soát tự động định kỳ các đơn chờ thanh toán với payOS, cập nhật trạng thái hóa đơn và ghi nhận phiếu thu. | M1, M2 | ORIGINAL_REQUEST §R4 |
| 19 | R4.5 Backup Operations Integrity | Thuật toán xoay vòng và kiểm tra toàn vẹn bản sao lưu (7 ngày, tuần, tháng), chặn xóa khi upload/kiểm tra thất bại. | M1, M2 | ORIGINAL_REQUEST §R4 |
| 20 | R5.1 Landlord E2E Workflows | E2E Chủ trọ: Quản lý dãy trọ, tạo phòng kiểm tra quota Free, thêm khách cấp link, ghi chỉ số chốt hóa đơn, thu tiền mặt một phần/đủ trong drawer. | M3 | ORIGINAL_REQUEST §R5 |
| 21 | R5.2 Tenant E2E Workflows | E2E Khách thuê: Mở link token `/t/:token` xem phòng & hóa đơn, mở checkout hiển thị QR & link payOS, nút kiểm tra đối soát, xử lý token hết hạn/thu hồi 404. | M3 | ORIGINAL_REQUEST §R5 |
| 22 | R5.3 Admin E2E Workflows | E2E Quản trị viên: Login admin tự chuyển hướng `/admin/owners`, duyệt chủ trọ chờ duyệt, từ chối kèm lý do bắt buộc, quản lý gói cước Pro. | M3 | ORIGINAL_REQUEST §R5 |
| 23 | R6 Environment & Isolation | In-memory SQLite, disposable temporary database, blackholing network proxy, mock loopback SMTP & payOS, tuyệt đối không chạm DB dev/prod. | M1, M2, M3, M4 | ORIGINAL_REQUEST §R6 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Backend C# Test Suite Expansion | Triển khai các bộ test HTTP TestServer trong `tests/RoomRental.WebhookTests` (AuthSecurityHttpTests, RoomTenantLifecycleHttpTests, AccountingBillingHttpTests, PayOsOperationsHttpTests) | None | DONE |
| M2 | Python Integration Suite Validation | Xác thực và hoàn thiện bộ test Python integration (`tests/`) chạy 100% PASS trên disposable API runner (`run_disposable.py`) | None | DONE |
| M3 | Frontend Playwright E2E Suite | Triển khai các kịch bản Playwright E2E cho Chủ trọ, Khách thuê, Admin (`frontend/e2e/`) đảm bảo 100% PASS, offline cách ly | None | DONE |
| M4 | Final Regression & Forensic Audit | Chạy toàn bộ 3 bộ test (C#, Python, Playwright), kiểm tra 100% PASS, audit tính toàn vẹn, bảo vệ mã nguồn ứng dụng | M1, M2, M3 | DONE |

## Interface Contracts
### C# Test Runner Contract
- Command: `dotnet run --project tests/RoomRental.WebhookTests`
- Assertion pattern: In-memory TestServer with `SqliteConnection("Data Source=:memory:")` and `EphemeralDataProtectionProvider`.
- Success criterion: Process exits with code 0, all suites report `PASS`.

### Python Integration Harness Contract
- Command: `ASPNETCORE_WEBROOT="<root>/frontend/dist" /usr/bin/python3 tests/run_disposable.py --app backend/RoomRental.Api/bin/Debug/net10.0 --provider sqlite`
- OTP Command: `/usr/bin/python3 tests/run_disposable.py --app backend/RoomRental.Api/bin/Debug/net10.0 --provider otp`
- Backup Command: `/usr/bin/python3 -m unittest tests/test_backup_retention.py tests/test_backup_alert.py tests/test_backup_safety.py -v`
- Success criterion: All 93 tests execute with 0 failures, 0 errors, 0 skips, code 0.

### Frontend Playwright Contract
- Command: `cd frontend && npx playwright test`
- Configuration: `frontend/playwright.config.ts`, baseURL `http://127.0.0.1:4178`, `webServer: { command: 'npm run preview -- --host 127.0.0.1 --port 4178' }`.
- Route Interception: All `/api/**` intercepted via `page.route`; all external calls to `https://pay.payos.vn/**` intercepted via `context.route`.
- Success criterion: All specs exit with code 0.

## Code Layout
- `backend/RoomRental.Api/`: Mã nguồn chính Backend ASP.NET Core (chỉ đọc, không chỉnh sửa trừ khi có lỗi logic cần sửa kèm test proof).
- `frontend/src/`: Mã nguồn chính Frontend React/Vite (chỉ đọc, không chỉnh sửa).
- `tests/RoomRental.WebhookTests/`: Dự án test C# (các file test HTTP TestServer mới và cập nhật `Program.cs`).
- `tests/`: Bộ test Python integration và harness scripts (`run_disposable.py`, `otp_smtp_fixture.py`, `test_*.py`).
- `frontend/e2e/`: Bộ kịch bản Playwright E2E (`smoke.spec.ts`, `landlord.spec.ts`, `tenant.spec.ts`, `admin.spec.ts`).
- `.agents/teamwork/`: Thư mục metadata của các agent (plans, progress, handoffs, gating).
