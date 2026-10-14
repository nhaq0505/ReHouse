## BÁO CÁO HOÀN THÀNH NÂNG CẤP REHOUSE

### 1. Danh sách file đã thay đổi

- `backend/RoomRental.Api/Domain/ApiDtos.cs` — Cho phép bỏ confirmPassword trong API đổi mật khẩu.
- `backend/RoomRental.Api/Endpoints/AuthEndpoints.cs` — Mật khẩu 8–256 ký tự; giữ sid hiện tại, thu hồi các phiên khác nguyên tử.
- `backend/RoomRental.Api/Endpoints/BillingEndpoints.cs` — Thêm bộ lọc kind, lifecycleState, status và search cho danh sách hóa đơn.
- `backend/RoomRental.Api/Endpoints/MoveoutEndpoints.cs` — Tính baseline công tơ bằng MAX trên DB.
- `backend/RoomRental.Api/Endpoints/OwnerManagementEndpoints.cs` — SQL aggregation Dashboard; giới hạn lịch sử đọc số và MAX theo phòng.
- `backend/RoomRental.Api/Program.cs` — Health kiểm tra kết nối DB và trả 200/503.
- `backend/RoomRental.Api/Services/PayOsService.cs` — Khôi phục kiểm tra owner của callback Invoice; bỏ fallback khóa chủ khác.
- `backend/RoomRental.Api/Services/QueryAggregates.cs` — Helper SUM tiền và MAX công tơ tương thích PostgreSQL/SQLite.
- `deploy/rehouse-backup.sh` — Off-host sync opt-in; giữ bản local khi đồng bộ thất bại.
- `docs/PROJECT_HANDOFF.md` — Cập nhật bàn giao, kết quả kiểm tra và sự cố an toàn QA.
- `docs/api-contract.md` — Đồng bộ hợp đồng trả phòng, báo cáo, archive, mật khẩu, lọc hóa đơn và health.
- `docs/implementation-notes.md` — Đồng bộ nghiệp vụ và hướng dẫn cấu hình off-host.
- `docs/backend-performance-security-ops-report.md` — Lưu báo cáo hoàn thành theo mẫu review.
- `frontend/src/api.ts` — Giữ hàm changePassword, cho phép bỏ confirmPassword khi gọi API.
- `frontend/src/components/AppShell.tsx` — Mục Đổi mật khẩu mở Modal trong menu tài khoản.
- `frontend/src/components/ChangePasswordModal.tsx` — Modal ba ô, kiểm tra xác nhận, loading và thông báo giữ phiên.
- `frontend/src/i18n/source.json` — Thêm 6 chuỗi nguồn tiếng Việt.
- `frontend/src/i18n/translations.tsv` — Thêm bản dịch en/zh/ko/hi cho 6 chuỗi mới.
- `frontend/src/i18n/en.json` — Sinh lại catalog tiếng Anh.
- `frontend/src/i18n/zh.json` — Sinh lại catalog tiếng Trung.
- `frontend/src/i18n/ko.json` — Sinh lại catalog tiếng Hàn.
- `frontend/src/i18n/hi.json` — Sinh lại catalog tiếng Hindi.
- `frontend/src/i18n/errors.ts` — Ánh xạ lỗi đổi mật khẩu đủ năm ngôn ngữ.
- `frontend/src/pages/PasswordPage.tsx` — Đồng bộ route đổi mật khẩu cũ; giữ chính sách reset bằng mã.
- `frontend/vite.config.ts` — Tách vendor và xử lý dependency/context dùng chung để tránh chunk vòng.
- `tests/README.md` — Hướng dẫn DB disposable và chặn outbound, cập nhật kết quả.
- `tests/RoomRental.WebhookTests/PayOsPaymentTests.cs` — Thêm 3 assertions callback khác chủ, kể cả trùng signing key.
- `tests/test_account_occupancy_dashboard.py` — Cập nhật kỳ vọng giữ phiên hiện tại và fixture Kind=Invoice.
- `tests/test_api_integration.py` — Thêm test đổi mật khẩu/thu hồi phiên, lọc hóa đơn và baseline nhiều kỳ.
- `tests/test_billing_upgrade.py` — Bổ sung Kind=Invoice cho fixture pending payment.
- `tests/test_payos_fixture.py` — Bổ sung Kind=Invoice cho fixture webhook.

### 2. Chi tiết triển khai kỹ thuật

- **Backend & SQL Optimization:** Dashboard dùng SUM trực tiếp trên PostgreSQL, fallback decimal chính xác cho SQLite; đếm pending bằng NOT EXISTS theo occupancy. Rooms chỉ lấy bản đọc kỳ chọn và bản gần nhất trước kỳ, kết hợp SQL MAX toàn lịch sử/legacy final để giữ baseline và logic hai lượt thuê cùng tháng. Invoices thêm bốn bộ lọc tùy chọn, giữ JSON array. Health dùng CanConnectAsync, trả 200/503.
- **Account Security & Frontend:** PasswordHasher, kiểm tra mật khẩu hiện tại, mật khẩu mới 8–256, transaction Serializable thu hồi phiên khác và giữ sid/cookie hiện tại; auth limiter và Same-Origin giữ nguyên. ConfirmPassword tùy chọn ở API, bắt buộc trên Modal. Owner/Admin dùng cùng Modal, route cũ vẫn hoạt động; reset bằng mã giữ chính sách mạnh cũ. Thêm 6 khóa i18n; chia React/query/icons/Ant Design thành các chunk dưới 500 kB. Sửa lỗi owner isolation webhook có sẵn được test phát hiện; giữ xác thực chữ ký, số tiền và idempotency.
- **Docs & Ops:** Đồng bộ complete-moveout `{occupancyId,requestId,refundAmount,expectedHeld,expectedDepositVersion}`, bỏ mô tả final-invoice cũ, bổ sung reports/export và archive/restore. Backup hỗ trợ OFFHOST_SYNC_CMD ưu tiên trước RCLONE_DEST; mặc định local giữ nguyên. Sync thất bại trả lỗi, giữ bản local hoàn chỉnh và không chạy retention. Chưa commit, push, deploy hoặc cấu hình remote/VPS.

### 3. Kết quả Build & Test

- `dotnet build backend/RoomRental.Api`: PASS, **0 warning / 0 error**.
- `dotnet run --project tests/RoomRental.WebhookTests`: PASS, **81 assertions**, HTTP provider được giả lập trong tiến trình.
- `npm --prefix frontend run i18n:build`: PASS, **908 khóa × 4 catalog**, cùng nguồn vi đủ 5 ngôn ngữ.
- `npm --prefix frontend run i18n:check`: PASS, **908 khóa × 4 catalog**.
- `npm --prefix frontend run build`: PASS; không còn warning chunk lớn/circular. Kích thước minified (gzip): **antd 484,95 (133,47) kB; antd-controls 429,74 (143,74) kB; index 376,16 (100,35) kB; react-vendor 263,68 (83,77) kB; antd-data 78,70 (23,78) kB; antd-icons 63,83 (17,50) kB; antd-core 55,45 (19,61) kB; react-query 40,63 (12,05) kB**.
- `python3 -m unittest` trên SQLite disposable, dùng `/usr/bin/python3` (Python 3.9 để kiểm tra XLSX): **59/59 PASS**. Từng suite: `test_api_integration` **20/20**; `test_billing_upgrade` **17/17**; `test_reports_archive` **6/6**; `test_payos_fixture` **4/4**; bổ sung `test_account_occupancy_dashboard` **12/12**.
- PostgreSQL disposable riêng: `test_api_integration` **20 pass**; billing **15 pass, 2 skip**; reports **6 pass**; account **7 pass, 5 skip**; payos fixture **class skip**. Tổng **55 test methods: 48 pass, 7 skip**, cộng một class skip; output unittest: `Ran 55 tests`, `OK (skipped=8)`.
- Health trên DB riêng: **200 → 503 → 200** khi dừng/chạy lại container. Backup: syntax PASS và **7/7 ca giả lập PASS**, chưa đồng bộ tới remote thật. `git diff --check`: PASS.
- Modal kiểm tra trên bản build thật bằng tài khoản mẫu DB disposable: đủ ba ô và nút Hủy/Lưu, viewport **375px**, dialog **359px**, không tràn ngang; không nhập/submission mật khẩu mới bằng browser. Ảnh minh chứng: `/tmp/rehouse-upgrade-qa.VfeGS0/password-modal-mobile.jpg`.

### 4. Kiểm tra an toàn môi trường (Safety Verification)

- **DB Development thật không thay đổi:** trước/sau đều **319 hóa đơn / tổng 250.783.641 VND / đã thu 46.440.913 VND**. Digest theo Id/Total/Paid đều `aebb0c3698576d08c7f515c15ebb40c9`; chỉ đối chiếu bằng transaction READ ONLY. Không reset/seed/chạy test/upgrade DB thật, không sửa SQLite snapshot `.local-data`.
- **Ngoại lệ guardrail cần review:** 2 lượt QA đầu đã gửi yêu cầu tạo checkout gói Pro bằng khóa giả tới API payOS thật, đều bị từ chối HTTP 200/code 214. Không có PaymentLinkId/CheckoutUrl, không tạo checkout hoặc giao dịch thật. Callback HTTP localhost chỉ chặn đăng ký webhook, không chặn luồng Subscription có sẵn. Đã dừng API, chặn toàn bộ outbound HTTP(S) qua proxy local và chạy lại cả hai DB; các yêu cầu tiếp theo bị chặn tại máy. Vì sự cố này, **không thể tuyên bố toàn phiên tuân thủ tuyệt đối yêu cầu không gọi API payOS thật**.
- DB kiểm thử ở `/tmp/rehouse-upgrade-qa.VfeGS0/qa.db` và container riêng `rehouse-upgrade-qa-20261014`, PostgreSQL port **15494**, callback HTTP localhost. Dịch vụ/container kiểm thử đã dừng và container riêng đã gỡ; log/ảnh giữ ở thư mục `/tmp` trên. Không thao tác pending payment thật.
- `git status --short` — output thực tế:

```text
 M backend/RoomRental.Api/Domain/ApiDtos.cs
 M backend/RoomRental.Api/Endpoints/AuthEndpoints.cs
 M backend/RoomRental.Api/Endpoints/BillingEndpoints.cs
 M backend/RoomRental.Api/Endpoints/MoveoutEndpoints.cs
 M backend/RoomRental.Api/Endpoints/OwnerManagementEndpoints.cs
 M backend/RoomRental.Api/Program.cs
 M backend/RoomRental.Api/Services/PayOsService.cs
 M deploy/rehouse-backup.sh
 M docs/PROJECT_HANDOFF.md
 M docs/api-contract.md
 M docs/implementation-notes.md
 M frontend/src/api.ts
 M frontend/src/components/AppShell.tsx
 M frontend/src/i18n/en.json
 M frontend/src/i18n/errors.ts
 M frontend/src/i18n/hi.json
 M frontend/src/i18n/ko.json
 M frontend/src/i18n/source.json
 M frontend/src/i18n/translations.tsv
 M frontend/src/i18n/zh.json
 M frontend/src/pages/PasswordPage.tsx
 M frontend/vite.config.ts
 M tests/README.md
 M tests/RoomRental.WebhookTests/PayOsPaymentTests.cs
 M tests/test_account_occupancy_dashboard.py
 M tests/test_api_integration.py
 M tests/test_billing_upgrade.py
 M tests/test_payos_fixture.py
?? backend/RoomRental.Api/Services/QueryAggregates.cs
?? docs/backend-performance-security-ops-report.md
?? frontend/src/components/ChangePasswordModal.tsx
```

- `git diff --stat` — output thực tế (chưa tính 3 file untracked nêu ở status):

```text
 backend/RoomRental.Api/Domain/ApiDtos.cs           |  2 +-
 backend/RoomRental.Api/Endpoints/AuthEndpoints.cs  | 11 ++-
 .../RoomRental.Api/Endpoints/BillingEndpoints.cs   | 21 +++++-
 .../RoomRental.Api/Endpoints/MoveoutEndpoints.cs   | 11 ++-
 .../Endpoints/OwnerManagementEndpoints.cs          | 81 ++++++++++++----------
 backend/RoomRental.Api/Program.cs                  | 14 +++-
 backend/RoomRental.Api/Services/PayOsService.cs    |  5 +-
 deploy/rehouse-backup.sh                           | 36 ++++++++++
 docs/PROJECT_HANDOFF.md                            | 19 ++++-
 docs/api-contract.md                               | 66 ++++++++++++------
 docs/implementation-notes.md                       | 33 ++++++++-
 frontend/src/api.ts                                |  2 +-
 frontend/src/components/AppShell.tsx               |  5 +-
 frontend/src/i18n/en.json                          |  8 ++-
 frontend/src/i18n/errors.ts                        |  8 +++
 frontend/src/i18n/hi.json                          |  8 ++-
 frontend/src/i18n/ko.json                          |  8 ++-
 frontend/src/i18n/source.json                      |  8 ++-
 frontend/src/i18n/translations.tsv                 |  6 ++
 frontend/src/i18n/zh.json                          |  8 ++-
 frontend/src/pages/PasswordPage.tsx                | 10 ++-
 frontend/vite.config.ts                            | 25 +++++++
 tests/README.md                                    | 58 ++++++++++++----
 tests/RoomRental.WebhookTests/PayOsPaymentTests.cs | 20 ++++++
 tests/test_account_occupancy_dashboard.py          |  6 +-
 tests/test_api_integration.py                      | 54 ++++++++++++++-
 tests/test_billing_upgrade.py                      |  8 +--
 tests/test_payos_fixture.py                        |  4 +-
 28 files changed, 431 insertions(+), 114 deletions(-)
```
