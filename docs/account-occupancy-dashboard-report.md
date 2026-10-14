# Triển khai Occupancy, Password và Dashboard — 14/10/2026

Đã triển khai cả 3 hạng mục trên checkout local của `nhaq0505/ReHouse`. Chưa commit/push,
deploy hoặc nâng cấp DB đang vận hành. Thư mục video-shotcraft có sẵn của người dùng được giữ nguyên.

## Kiến trúc và lựa chọn triển khai

Backend ASP.NET Core .NET 10 Minimal API + EF Core, SQLite/PostgreSQL; cookie xác thực với
AuthSessions lưu DB, middleware kiểm tra phiên, vai trò/trạng thái và Origin. Frontend
React 19 + TypeScript + Vite + Ant Design + React Query, có 4 catalog dịch. Hóa đơn có
Draft/Issued, snapshot phí, Paid/receipts, Version và InvoiceRevisions. Không có nhà cung cấp email.
UI dùng lại component, màu/font và phong cách hiện có; không thêm thư viện, dark mode hoặc dữ liệu mẫu
vào source sản phẩm. Màu/font vẫn ở frontend/src/styles.css, không thay thương hiệu.

## API và hành vi

| API | Hành vi mới |
| --- | --- |
| PATCH /api/rooms/{id}/occupancy | Nhận occupancyId, tenantName, phone?, people; trả RoomDto. Chỉ room thuộc owner và đúng occupancy active. Tên 1–160, phone ≤60, số người 1–30. Sai ID/stale →409, khác owner →404. |
| POST /api/auth/change-password | Current/new/confirm, xác minh mật khẩu cũ; mật khẩu mới 12–256 ký tự có hoa/thường/số/ký tự đặc biệt, khác mật khẩu cũ. Thu hồi mọi phiên và yêu cầu đăng nhập lại. Owner Pending cũng có thể đổi. |
| POST /api/admin/owners/{id}/reset-password | Admin xác nhận currentPassword; cấp mã 256-bit, 64 ký tự hex, hết hạn 30 phút. Chỉ trả mã một lần, no-store; revoke session và buộc owner đặt mật khẩu mới trước khi đăng nhập. |
| POST /api/auth/reset-password | Email/token/new/confirm; kiểm tra băm và expiry, dùng một lần atomically. Sai, hết hạn, dùng lại →400; xung đột đồng thời có thể →409. Không tự đăng nhập hoặc thay approval status. |
| GET /api/dashboard | Thêm period/monthlyBilled/monthlyPaid/monthlyOutstanding/collectionRate. Trường all-time cũ giữ nguyên. UI dùng 4 KPI tháng, block all-time riêng. |

Occupancy update không sửa start/end date, cọc, phí phòng hay link khách. Giữ nguyên **mọi
hóa đơn Issued**, gồm chưa trả, trả một phần và đã trả. Hóa đơn Monthly Draft tính nước theo người
được tính lại bằng WaterRate đã snapshot; tăng Version và lưu revision trước/sau. Paid status,
Paid khác 0, receipt hoặc pending payOS trên Draft chặn toàn bộ update. Không thay đổi giá nước cố định.

Reading mới snapshot OccupantsCount. Tạo/recover hóa đơn dùng số người lúc chốt reading, tránh
lấy số người hiện tại để suy diễn kỳ lịch sử. Legacy per-person reading thiếu count và thiếu invoice
được bỏ qua bởi sweep; không tự backfill từ occupancy hiện tại. Existing invoices không bị ảnh hưởng.

Reset token chỉ lưu SHA-256; mật khẩu dùng ASP.NET PasswordHasher, không lưu/log plaintext.
Current/new password và mã reset không nằm trong URL. Luồng credential có rate limit, transaction
Serializable, concurrency token PasswordHash/PasswordResetHash và thu hồi sessions. Admin giao mã
riêng sau khi xác minh danh tính; không có luồng email/SMS tự động. Hướng mã ngẫu nhiên, hết hạn,
dùng một lần và hủy phiên tham khảo [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

KPI lấy **kỳ hóa đơn hiện tại** theo Asia/Ho_Chi_Minh, chỉ Issued không phải Deposit; Draft/cọc
không tính. Tổng phải thu là sum Total; đã thu là sum Paid; còn thu là sum max(0,Total−Paid);
tỷ lệ = Paid/Total×100, làm tròn 2 chữ số, 0 nếu không có hóa đơn. Đây là paid balance của hóa đơn
kỳ này, không phải tiền mặt nhận trong tháng; báo cáo receipt giữ mục đích dòng tiền. Hóa đơn gần đây
lấy cùng period do server trả về. Kiểm tra ranh giới UTC 17:00 sang ngày/tháng/năm Việt Nam.

## Schema và nâng cấp

| Bảng/cột | SQLite | PostgreSQL | Mặc định |
| --- | --- | --- | --- |
| Users.PasswordResetHash | TEXT NULL | TEXT NULL | null |
| Users.PasswordResetExpiresAt | INTEGER NULL (EF DateTimeOffset converter) | timestamp with time zone NULL | null |
| Readings.OccupantsCount | INTEGER NULL | INTEGER NULL | null |

Theo kiến trúc hiện có, upgrade chạy idempotent trong DatabaseInitializer sau EnsureCreated,
kiểm tra cột và ALTER ADD COLUMN trong transaction. Không chuyển sang EF migration pipeline,
không xóa bảng/DB, không update tài chính hoặc backfill số người lịch sử. Khởi động lại app phiên bản mới
sẽ áp upgrade; backup DB trước khi triển khai và nâng cấp bằng một instance theo runbook hiện tại.
DbMigrator hỗ trợ backup cũ thiếu 3 cột qua projection null, không sửa source read-only.

## Kết quả kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| API build và DbMigrator build | Pass, 0 warning/error |
| Frontend TypeScript + Vite build | Pass; cảnh báo bundle >500kB còn từ dự án |
| i18n build/check | Pass, 828 source keys ×4 catalogs |
| Full HTTP suite SQLite dùng riêng | **52/52 pass** |
| Full HTTP suite PostgreSQL 17 dùng riêng | **48 run: 40 pass, 8 skip** (fixture cần SQLite) |
| Console service/payOS giả | **71 assertions pass**, thêm timezone và snapshot count/password validation |
| Test mới riêng | **12/12 pass** trên SQLite; gồm concurrent reset token tiêu thụ đúng một lần |
| Legacy SQLite upgrade | 211 invoice rows giữ nguyên toàn bộ cột; thêm lại 3 cột đúng kiểu |
| Legacy PostgreSQL upgrade | Invoice row JSON digest trước/sau giữ nguyên; 3 cột được thêm lại |
| Import pre-upgrade backup | Source giữ nguyên thiếu 3 cột; 211 snapshot Id/Total/Paid/WaterAmount/TenantName/Period/LifecycleState khớp target PG |
| Whitespace check | Pass; dự án chưa có lint script riêng |

QA dùng API 5087/5088/5089, DB dưới /tmp và PostgreSQL container riêng; callback HTTP localhost,
background sweep/reconciliation tắt. Không dùng DB/VPS đang vận hành, không tạo thanh toán thật,
không gọi provider payOS. Các fixture tạo dữ liệu giả; không lưu credential/token thật trong repo.

Browser CUA kiểm tra form sửa người thuê desktop và mobile375 (đúng dữ liệu, một dialog,
không tràn ngang), self-change mobile, public reset, admin reset dialog và Dashboard. Credential
mutation được kiểm tra qua API riêng; browser không nhập/submit mật khẩu mới. Không chạy probe.mjs;
đo responsive bằng DOM và screenshot của CUA. Ảnh local trong tests/artifacts; toàn bộ là tài khoản/dữ liệu QA:

- [Sửa người thuê desktop](../tests/artifacts/rehouse-edit-occupancy-desktop.jpg)
- [Sửa người thuê mobile](../tests/artifacts/rehouse-edit-occupancy-mobile.jpg)
- [Đổi mật khẩu mobile](../tests/artifacts/rehouse-change-password-mobile.jpg)
- [Admin reset dialog](../tests/artifacts/rehouse-admin-reset-password.jpg)

## Lưu ý còn lại

- Admin phải giao mã recovery thủ công và xác minh đúng owner. Mã hết hạn cần cấp lại;
  hết hạn không khôi phục quyền login bằng mật khẩu cũ. Không có recovery cho admin quên mật khẩu trong phạm vi này.
- Legacy per-person reading thiếu snapshot và thiếu invoice cần xử lý có kiểm chứng; sweep cố ý không
  tự tạo lại số tiền lịch sử từ headcount hiện tại. Không thay đổi invoice đã tồn tại.
- 8 test PostgreSQL skip là các fixture direct-DB chỉ hỗ trợ SQLite; concurrency reset và API thông thường
  đã chạy trên cả hai provider. Reauthentication/session revocation admin self-change có fixture đầy đủ trên SQLite.
- UI mới cần backend cùng phiên bản; restart/nâng cấp theo runbook trước khi dùng trên app đang chạy.
  Source hiện local, không có thay đổi database vận hành, push hoặc deployment.
- Cơ chế schema startup hiện tại vẫn cần quy trình backup/triển khai phối hợp nhiều instance của dự án;
  đợt này không mở rộng thành một hệ thống migrations/HA mới.

## Danh sách file đã thay đổi/thêm

### Backend

- [backend/RoomRental.Api/Data/AppDbContext.cs](../backend/RoomRental.Api/Data/AppDbContext.cs)
- [backend/RoomRental.Api/Data/DatabaseInitializer.cs](../backend/RoomRental.Api/Data/DatabaseInitializer.cs)
- [backend/RoomRental.Api/Domain/ApiDtos.cs](../backend/RoomRental.Api/Domain/ApiDtos.cs)
- [backend/RoomRental.Api/Domain/Entities.cs](../backend/RoomRental.Api/Domain/Entities.cs)
- [backend/RoomRental.Api/Endpoints/AdminEndpoints.cs](../backend/RoomRental.Api/Endpoints/AdminEndpoints.cs)
- [backend/RoomRental.Api/Endpoints/AuthEndpoints.cs](../backend/RoomRental.Api/Endpoints/AuthEndpoints.cs)
- [backend/RoomRental.Api/Endpoints/BillingEndpoints.cs](../backend/RoomRental.Api/Endpoints/BillingEndpoints.cs)
- [backend/RoomRental.Api/Endpoints/OwnerManagementEndpoints.cs](../backend/RoomRental.Api/Endpoints/OwnerManagementEndpoints.cs)
- [backend/RoomRental.Api/Services/ApiSupport.cs](../backend/RoomRental.Api/Services/ApiSupport.cs)
- [backend/RoomRental.Api/Services/InvoiceService.cs](../backend/RoomRental.Api/Services/InvoiceService.cs)
- [backend/RoomRental.Api/Services/PasswordSecurity.cs](../backend/RoomRental.Api/Services/PasswordSecurity.cs)
- [backend/RoomRental.DbMigrator/Program.cs](../backend/RoomRental.DbMigrator/Program.cs)

### Frontend

- [frontend/src/App.tsx](../frontend/src/App.tsx)
- [frontend/src/api.ts](../frontend/src/api.ts)
- [frontend/src/components/AppShell.tsx](../frontend/src/components/AppShell.tsx)
- [frontend/src/i18n/en.json](../frontend/src/i18n/en.json)
- [frontend/src/i18n/hi.json](../frontend/src/i18n/hi.json)
- [frontend/src/i18n/ko.json](../frontend/src/i18n/ko.json)
- [frontend/src/i18n/source.json](../frontend/src/i18n/source.json)
- [frontend/src/i18n/translations.tsv](../frontend/src/i18n/translations.tsv)
- [frontend/src/i18n/zh.json](../frontend/src/i18n/zh.json)
- [frontend/src/pages/AccountStatusPage.tsx](../frontend/src/pages/AccountStatusPage.tsx)
- [frontend/src/pages/AdminOwnersPage.tsx](../frontend/src/pages/AdminOwnersPage.tsx)
- [frontend/src/pages/DashboardPage.tsx](../frontend/src/pages/DashboardPage.tsx)
- [frontend/src/pages/LoginPage.tsx](../frontend/src/pages/LoginPage.tsx)
- [frontend/src/pages/PasswordPage.tsx](../frontend/src/pages/PasswordPage.tsx)
- [frontend/src/pages/RoomsPage.tsx](../frontend/src/pages/RoomsPage.tsx)

### Tests

- [tests/README.md](../tests/README.md)
- [tests/RoomRental.WebhookTests/AccountOccupancyTests.cs](../tests/RoomRental.WebhookTests/AccountOccupancyTests.cs)
- [tests/RoomRental.WebhookTests/Program.cs](../tests/RoomRental.WebhookTests/Program.cs)
- [tests/test_account_occupancy_dashboard.py](../tests/test_account_occupancy_dashboard.py)

### Tài liệu

- [docs/PROJECT_HANDOFF.md](../docs/PROJECT_HANDOFF.md)
- [docs/account-occupancy-dashboard-report.md](../docs/account-occupancy-dashboard-report.md)
- [docs/api-contract.md](../docs/api-contract.md)

