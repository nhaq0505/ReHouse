# Ghi chú triển khai MVP

## Phạm vi đã chốt

- Nhiều chủ trọ, admin duyệt trước khi dùng; dữ liệu tách theo chủ trọ.
- Chủ trọ quản lý dãy, phòng và lượt thuê; link khách theo lượt thuê.
- Nhập chỉ số điện thủ công. Camera và Gemini API chuyển sang giai đoạn sau.
- Tiền điện = (chỉ số mới − chỉ số đã chốt) × đơn giá điện. Không dùng toàn bộ chỉ số tích lũy để tính tiền.
- Phí nước cố định hoặc theo số người; dịch vụ cố định theo phòng. Tiền thuê tháng chưa đủ kỳ do chủ trọ cấu hình trước khi chốt chỉ số.
- Chốt chỉ số hợp lệ sẽ phát hành hóa đơn. Giá tiền được chụp lại tại thời điểm phát hành.
- Hạn thanh toán mặc định là ngày 5 tháng tiếp theo; chưa cấu hình hạn riêng từng phòng trong MVP.
- Tiền khách thanh toán qua payOS về cấu hình riêng của chủ trọ. Portal hiển thị QR inline từ phản hồi tạo link đã ký; hóa đơn đang có giao dịch chờ được dùng lại, và link payOS chỉ mở theo nút bấm rõ ràng khi đúng HTTPS host. Không tự chuyển hướng hoặc gạch nợ từ URL/trạng thái provider. Chỉ webhook đã xác minh hoặc đối soát có số tiền giao dịch khớp mới ghi receipt và cập nhật hóa đơn.

## Ranh giới vận hành

MVP chưa có tiền cọc, hợp đồng điện tử, hóa đơn thuế, hoàn tiền tự động, chỉ số nước hay chia công tơ chung. Mỗi phòng có một bản chỉ số điện cho một tháng; chưa tự quyết toán hai lượt thuê thay nhau trong cùng một tháng. Nợ của lượt thuê đã kết thúc vẫn nằm trong hệ thống chủ trọ và không chuyển sang lượt thuê mới.

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
