# Sửa CI và điều kiện cấp link payOS — 15/10/2026

## Nguyên nhân

[Run 38676273367](https://github.com/nhaq0505/ReHouse/actions/runs/38676273367), commit `2e28b8d`, build thành công nhưng API integration chỉ đạt18/20. Hai test `test_rotating_guest_link_revokes_the_previous_token` và `test_new_occupancy_does_not_inherit_previous_tenant_invoice_history` dùng chủ trọ chưa xác minh payOS, gọi `/api/rooms/{id}/rotate-link` và nhận400 theo điều kiện mới. Publish/deploy bị bỏ qua.

## Thay đổi

- CI đặt `RequireVerifiedPaymentForTenantLink=false` riêng cho API Development/database tạm của các test nghiệp vụ cũ. Production từ chối khởi động nếu cấu hình này bị tắt; mặc định luôn bắt buộc.
- Dùng chung điều kiện xác minh hiện tại của chủ trọ cho rotate-link và việc trả token/url trong dữ liệu phòng, tạo/sửa lượt thuê, hóa đơn. Chưa cấu hình, xác minh thất bại, đổi khóa hoặc đổi webhook origin đều giữ link ẩn. Kiểm tra một lần theo chủ trọ cho API danh sách.
- Token/link nullable không ngăn quản lý phòng, nhận khách hoặc lập hóa đơn. Link đã chia sẻ trước đó vẫn xem được hóa đơn; không tự thu hồi chỉ vì thay đổi cấu hình thanh toán.
- Xóa test tự lặp lại `if`; thêm `TenantLinkHttpTests` sử dụng route handler thật trong ASP.NET TestServer, SQLite in-memory, authentication giả và payOS giả trong process. Không gọi provider thật. Test này luôn bật điều kiện bắt buộc, độc lập với bypass của CI nghiệp vụ.
- Cập nhật API contract, kiểu nullable frontend, hướng dẫn payOS và lệnh chạy test.

## Kiểm tra trước push

- Backend build PASS; frontend build/prerender PASS; i18n1030×4 PASS; `git diff --check` PASS.
- `dotnet run --project tests/RoomRental.WebhookTests --configuration Release`: exit0,206 dòng assertion PASS, gồm HTTP cấp link khi chưa/đã xác minh, token ẩn qua API phòng/hóa đơn, sửa phòng/lượt thuê, thu hồi link cũ, origin/khóa thay đổi và chủ trọ khác.
- SQLite tạm: `unittest discover -s tests -p 'test_*.py' -v` → Ran72 tests, OK(skipped=2).
- PostgreSQL17 container riêng, không dùng database Development: API20/20 và SEO13/13 PASS, cùng môi trường bypass như CI. Container/volume tạm và API thử đã dừng/xóa.
- Thử khởi động Production với bypass=false: bị từ chối trước khi tạo database, đúng thông báo guard.
- Không gửi OTP, gọi payOS thật, tạo thanh toán thật hoặc sửa schema/dữ liệu vận hành. Bộ test email template có các cảnh báo nullable sẵn có, không làm build thất bại.
- Chưa kết luận CI/deploy thành công từ kết quả local; kiểm tra workflow sau push.

## Chính sách crawl

Giữ `robots.txt` là `User-agent: *` / `Disallow: /` theo yêu cầu người dùng. Không gửi sitemap hoặc yêu cầu Google index trong đợt này.
