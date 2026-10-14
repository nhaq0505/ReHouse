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

### Backup ngoài máy chủ (opt-in)

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
retention remote và restore drill phải cấu hình riêng. Thay đổi này chưa cài đặt/chạy lên VPS.
