# Kết quả kiểm tra MVP — 12/10/2026

Triển khai bằng ba agent `gpt-6-luna`, reasoning `max`: backend, frontend và kiểm thử. Agent chính chốt hợp đồng API, tích hợp, rà soát, sửa các điểm giao tiếp và kiểm tra bản chạy thực tế.

## Kết quả

- `dotnet build backend/RoomRental.Api --no-restore`: thành công, 0 cảnh báo, 0 lỗi.
- `npm --prefix frontend run build`: thành công. Các trang được tách chunk; thư viện Ant Design dùng chung còn phát sinh thông báo kích thước bundle, không phải lỗi build.
- `dotnet list backend/RoomRental.Api package --vulnerable --include-transitive`: không phát hiện package có lỗ hổng theo nguồn NuGet tại thời điểm kiểm tra.
- `npm audit --audit-level=high`: không phát hiện lỗ hổng.
- SQLite: 12/12 bài kiểm thử API và webhook fixture qua, bật chế độ ResourceWarning là lỗi.
- PostgreSQL 17: 11/11 bài kiểm thử nghiệp vụ qua. Fixture chèn trực tiếp SQLite không chạy trên PostgreSQL.
- Docker Compose Production: build và khởi động thành công, frontend được backend phục vụ cùng origin, admin bootstrap đăng nhập được. Dựng lại container với cùng volume vẫn giữ dữ liệu và phiên admin.
- Giao diện: đã thử đăng nhập, nhập chỉ số thủ công và tự phát hành hóa đơn trên desktop; trang khách ở chiều rộng 390 px không tràn ngang.

## Các tình huống đã kiểm tra

Chủ trọ chờ duyệt/bị khóa; truy cập chéo dữ liệu giữa chủ trọ; nguồn yêu cầu giả mạo; chỉ số giảm, trước lượt thuê hoặc ở kỳ tương lai; công thức tính điện, tiền nước theo người và phí; đơn giá hóa đơn giữ nguyên sau khi sửa phòng; phát hành lặp lại; thu tiền một phần và retry cùng khóa; thu hồi link; nợ không chuyển sang lượt thuê mới; webhook chữ ký sai; giao dịch ký hợp lệ sai số tiền; phạm vi chủ nhận tiền; webhook thanh toán lặp lại chỉ tạo một khoản thu.

Webhook fixture dùng giao dịch và khóa giả trên cơ sở dữ liệu Development được chỉ định rõ ràng. Không gọi payOS thật và không chuyển tiền. Cần kiểm thử checkout, ngân hàng và webhook HTTPS bằng cấu hình thật trước khi thu tiền vận hành. Camera và AI chưa triển khai theo phạm vi MVP đã điều chỉnh.
