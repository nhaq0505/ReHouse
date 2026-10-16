# Ghi chú triển khai MVP

## Phạm vi đã chốt

- Nhiều chủ trọ, admin duyệt trước khi dùng; dữ liệu tách theo chủ trọ.
- Chủ trọ quản lý dãy, phòng và lượt thuê; link khách theo lượt thuê.
- Nhập chỉ số điện thủ công. Camera và Gemini API chuyển sang giai đoạn sau.
- Tiền điện = (chỉ số mới − chỉ số đã chốt) × đơn giá điện. Không dùng toàn bộ chỉ số tích lũy để tính tiền.
- Phí nước cố định hoặc theo số người; dịch vụ cố định theo phòng. Luôn thu đủ giá thuê tháng; không tính theo số ngày vào/ra.
- Chốt chỉ số hợp lệ sẽ phát hành hóa đơn. Giá tiền được chụp lại tại thời điểm phát hành.
- Hạn thanh toán mặc định là ngày 5 tháng tiếp theo; chưa cấu hình hạn riêng từng phòng trong MVP.
- Tiền khách thanh toán qua payOS về cấu hình riêng của chủ trọ. Portal hiển thị QR inline từ phản hồi tạo link đã ký; hóa đơn đang có giao dịch chờ được dùng lại, và link payOS chỉ mở theo nút bấm rõ ràng khi đúng HTTPS host. Không tự chuyển hướng hoặc gạch nợ từ URL/trạng thái provider. Chỉ webhook đã xác minh hoặc đối soát có số tiền giao dịch khớp mới ghi receipt và cập nhật hóa đơn.

## Ranh giới vận hành

Đã hỗ trợ tiền cọc, hóa đơn bổ sung và nhiều lượt thuê trong cùng tháng: bản chỉ số/hóa đơn tháng gắn OccupancyId. Chưa có hợp đồng điện tử, hóa đơn thuế, hoàn tiền tự động, chỉ số nước hay chia công tơ chung. Nợ của lượt thuê đã kết thúc vẫn nằm trong hệ thống chủ trọ và không chuyển sang lượt thuê mới.

Link khách là thông tin truy cập bí mật. Chủ trọ có thể thu hồi/cấp lại. Không gửi link sang dịch vụ bên ngoài để phân tích; hạn chế thông tin cá nhân trên trang khách và không dùng script phân tích bên thứ ba.

Khóa API payOS phải do chủ trọ cung cấp. Cấu hình thật và URL webhook HTTPS công khai cần được kiểm thử trước khi nhận tiền. Kiểm thử tự động chỉ xác nhận các quy tắc nội bộ và chống giả mạo, không chứng minh một giao dịch ngân hàng thật thành công.

## Giai đoạn AI sau MVP

Thêm camera trực tiếp trên HTTPS, backend gửi ảnh đến Gemini API; khách xác nhận chỉ số đọc được, sai thì chụp lại. Giữ bước kiểm tra chỉ số theo phòng trước khi duyệt; ảnh không rõ hoặc vượt ngưỡng cần chủ trọ xử lý. Dịch vụ AI chỉ đề xuất chỉ số, không tính công nợ và không xác nhận thanh toán. Kiểm chứng trên công tơ thật trước khi bật tự duyệt.

## Trước khi vận hành thực tế

- Thiết lập HTTPS, tên miền, tài khoản admin riêng, tắt dữ liệu demo.
- Bảo vệ và sao lưu đồng thời PostgreSQL và khóa DataProtection; mất khóa sẽ không giải mã được cấu hình thanh toán/link khách.
- Thiết lập quan sát lỗi backend, job phát hành và đối soát thanh toán; thử quy trình khôi phục bản sao lưu.
- Kiểm thử payOS của từng chủ trọ: tạo link, nhận webhook thật, webhook lặp lại, đối soát khi mất webhook.
- Chạy thử một dãy qua một kỳ thu tiền trước khi mở rộng.

## Tối ưu backend, tài khoản và vận hành — 14/10/2026

- Dashboard tổng hợp tiền trực tiếp bằng SUM trên PostgreSQL; SQLite giữ decimal projection để cộng tiền chính xác. Đếm phòng/chỉ số thiếu qua subquery và NOT EXISTS theo OccupancyId, không tải danh sách ID/hóa đơn về RAM. KPI tháng và all-time giữ nguyên nghĩa.
- Danh sách phòng chỉ tải bản đọc của kỳ đã chọn và bản gần nhất trước kỳ. SQL MAX riêng trên toàn lịch sử giữ baseline vật lý, kể cả nhiều lượt thuê cùng tháng và legacy final invoices. SQLite MAX dùng double chỉ với chỉ số công tơ có giới hạn 1e9/3 chữ số thập phân; tiền không chuyển sang double.
- Hóa đơn hỗ trợ lọc server theo kind/lifecycleState/status/search, kết hợp period, giữ JSON array và owner isolation. Health check kiểm tra kết nối DB và trả 503 nếu không truy cập được.
- Owner/Admin đổi mật khẩu bằng currentPassword/newPassword (8–256 ký tự); confirmation tùy chọn trên API, bắt buộc trên UI. Transaction cập nhật hash và thu hồi mọi phiên khác, giữ sid hiện tại. Có auth rate limit và Same-Origin. Reset qua mã admin giữ chính sách mạnh 12–256 và thu hồi toàn bộ phiên.
- Menu tài khoản mở Modal đổi mật khẩu; route cũ vẫn hoạt động và giữ phiên. Chuỗi mới có đủ vi/en/zh/ko/hi; vendor Vite chia riêng React, React Query, Ant Design và icons.
- Trả phòng dùng `POST /api/rooms/{id}/complete-moveout` với `{occupancyId,requestId,refundAmount,expectedHeld,expectedDepositVersion}` (alias end-occupancy). Chặn nháp/nợ/payOS pending, ghi hoàn cọc thủ công và phần còn giữ có audit/idempotency, đóng lượt thuê/thu hồi link và cập nhật baseline. Không tạo final invoice, receipt giả hoặc chuyển tiền ngân hàng.
- Báo cáo `/api/reports/receipts|debt|deposits` và `/export.xlsx`: tổng theo toàn bộ tập lọc, snapshot lịch sử, Excel có kiểu và chống formula injection. Dãy/phòng DELETE là archive mềm; restore kiểm tra owner/quota và archive batch, giữ dữ liệu lịch sử.

### Backup ngoài máy chủ — đã hoạt động 16/10/2026

**Cấu hình hiện tại:** `/etc/rehouse/backup.env` root0600 đặt `OFFHOST_SYNC_CMD='/usr/local/sbin/rehouse-drive-sync "$1"'`. Helper đọc runtime.env rồi backup.env mà không source/eval toàn bộ file. Sync dùng rclone crypt, đúng folder đã duyệt, kiểm tra tải xuống/giải mã trước retention7bản ngày/4bản tuần/3bản tháng; local giữ10bản và có SHA256. Daily03:00–03:20VN và pre-deploy dùng cùng helper; off-site thất bại giữ local, trả lỗi và chặn app swap. OAuthInproduction, forced refresh trong systemd và restorePG17 tạm đều PASS. Xem [nhật ký backup/phục hồi](backup-operations.md).

Các ví dụ tổng quát bên dưới mô tả cơ chế opt-in ban đầu; nhận xét “chưa cài lên VPS” là checkpoint lịch sử, đã được thay thế bởi cấu hình hiện tại ở trên.

`deploy/rehouse-backup.sh` vẫn lưu dump, DataProtection keys và manifest local, giữ 10 bản.
Cấu hình trong `/etc/rehouse/runtime.env` (root quản lý, chmod 0600), mỗi giá trị trên một dòng:

```dotenv
# Chọn một; OFFHOST_SYNC_CMD được ưu tiên nếu đặt cả hai.
RCLONE_DEST=backup-remote:rehouse
# Hoặc hook tin cậy do quản trị viên viết; $1 và REHOUSE_BACKUP_DIR là thư mục backup hoàn chỉnh.
OFFHOST_SYNC_CMD='rclone copy -- "$1" "backup-remote:rehouse/${1##*/}"'
```

Không cấu hình thì hành vi local giữ nguyên. Rclone phải được cài và cấu hình quyền trên host;
`copy` dùng thư mục con riêng cho mỗi bản sao, không xóa remote. Hook được chạy bằng Bash với quyền root:
chỉ quản trị viên tin cậy được sửa cấu hình. Script không source toàn bộ runtime.env và không nội suy giá trị dotenv;
chỉ bỏ một cặp dấu nháy bao ngoài. Sync thất bại trả mã khác 0 để job báo lỗi, giữ nguyên bản local hoàn chỉnh
và không chạy retention. Bản remote chứa dữ liệu và khóa giải mã: dùng remote có mã hóa và phân quyền phù hợp;
retention remote và restore drill phải cấu hình riêng. Với VPS hiện tại, cả hai đã được cấu hình/kiểm chứng như nhật ký liên kết ở trên.

### Quản lý schema — EF Core Migrations

Startup dùng `MigrateAsync`; SQLite/PostgreSQL có context, migrations và snapshot riêng cùng model. Seed/bootstrap chạy sau migration. Các mô tả EnsureCreated/SQL nâng cấp trong báo cáo cũ là lịch sử trước cutover. Reset local/VPS chỉ thực hiện lần đầu theo chấp thuận riêng, không chạy lại mỗi lần deploy. Xem [quy trình và nhật ký migrations](ef-core-migrations.md).

## OTP email cho đăng ký mới

Đăng ký mới chờ OTP email trước khi tạo Users và đăng nhập; xác minh thành công tạo Owner Approved gói Free.
Không còn bước admin duyệt trong luồng tự đăng ký. Tài khoản cũ vẫn giữ quyền truy cập hiện có.
SMTP qua MailKit yêu cầu TLS; thiếu cấu hình hoặc gửi lỗi trả503 và không tạo tài khoản.
Bảng RegistrationVerifications giữ hash OTP/token, hạn mức gửi/nhập sai và password hash đang chờ;
không thay dữ liệu tài chính cũ. Migration đọc được snapshot có/chưa có bảng mới.
Xem [hướng dẫn cấu hình SMTP/Gmail và giới hạn](email-otp-setup.md).
Local đã sao lưu DB rồi thêm bảng mới; không seed/reset hoặc chạy integration test trên DB thật.
Chưa cấu hình hộp thư/mật khẩu ứng dụng và chưa gửi email thật, chưa push/deploy thay đổi OTP.

### Thu tiền thủ công khi đang có payOS pending (14/10/2026)

- ManualReceiptService kiểm tra owner, version, số dư và idempotency trước khi gọi provider. Trong transaction Serializable, GET trạng thái theo order code, xác minh chữ ký/order/amount/amountPaid rồi hủy order chưa nhận tiền. Chỉ CANCELLED/EXPIRED có amountPaid=0 mới kết thúc pending và ghi receipt Manual cùng cập nhật Paid/Version nguyên tử. Attempt.Status là concurrency token; unique pending reservation được giữ tới commit để chặn checkout xen vào.
- payOS đã nhận đủ tiền trước/trong lúc hủy: rollback nhánh cash, ghi payOS qua luồng xác minh/idempotency sẵn có, trả409 và FE tải lại hóa đơn/báo cáo. Đã nhận một phần hoặc dữ liệu thiếu/không hợp lệ: giữ pending, không thêm cash. Reconcile nền cũng không giải phóng order đóng nhưng đã nhận một phần tiền.
- Hủy từ xa thành công nhưng DB rollback/timeout: retry kiểm tra lại trạng thái đã hủy, không giả định thất bại HTTP đồng nghĩa link đã hủy. Pending cũ thiếu metadata vẫn lookup bằng order code. UI xác nhận giải thích tự kiểm tra/hủy; không yêu cầu người dùng đối soát thủ công trước mỗi lần thu.

### Operational hardening16/10/2026

Production uses a separate migration job/role and a DML runtime identity. Admin TOTP/recovery, persistent account login budgets, unified new-password policy, independent retention, server pagination, bounded backups/alerts and browser regressions are implemented. Earlier dated checkpoints remain history. See [release evidence](tech-debt-remediation-2026-10-16.md) for actual deployment status.
