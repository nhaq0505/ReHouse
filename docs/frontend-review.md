# Rà soát giao diện — 12/10/2026

## Lỗi đã xác nhận và sửa

- Menu Ant Design dùng màu chữ của giao diện sáng trên nền sidebar tối. Đã dùng theme dark và chỉ định màu cho từng mục, bao gồm drawer trên điện thoại.
- Khung trình duyệt hẹp thu toàn bộ điều hướng vào biểu tượng nhỏ. Đã bổ sung điều hướng hiện trực tiếp, nhãn Menu, tiêu đề trang và nút đóng drawer.
- Dashboard thiếu đường vào các thao tác thiết lập. Đã thêm Tạo dãy trọ, Tạo phòng trọ, Cấp link cho khách. Hai nút tạo mở biểu mẫu tương ứng.
- Thao tác cấp link bị giấu trong dấu ba chấm. Đã đưa nút ra từng phòng; mở lại link đang dùng, cho sao chép/mở trang khách. Thu hồi và tạo link mới có xác nhận riêng.
- Bảng rộng khiến thông tin/nút nằm ngoài khung. ResponsiveTable đo chiều rộng thực tế của vùng nội dung và chuyển sang thẻ khi bảng không vừa, giữ nguyên trường dữ liệu, form, hành động và phân trang. Áp dụng cho phòng, điện, hóa đơn và chủ trọ.
- Chữ thông tin nhiều nơi chỉ 8–11px. Đã tăng cỡ chữ, độ tương phản và viền focus bàn phím; thu gọn thống kê dashboard thành hai cột trên điện thoại.
- Selector mô tả trong trang khách ghi đè màu chữ nằm trong nút Thanh toán. Đã sửa màu chữ/icon của nút kế thừa màu của nút.
- Form tạo phòng quá dài, nút lưu nằm ngoài màn hình. Thân modal cuộn riêng trên điện thoại, footer vẫn hiện.
- Trang đăng nhập/đăng ký có tổng chiều rộng cột tối thiểu 820px nhưng chỉ đổi bố cục ở 760px. Đã đổi sang một cột ở 920px.
- Đồng bộ breakpoint, thêm nhãn cho bộ lọc/tháng, giới hạn drawer, xử lý tên/email dài và đưa đầu trang về vị trí bắt đầu khi đổi mục.

## Kiểm tra

- Rà soát mã toàn bộ frontend; kiểm tra trực quan các trang tổng quan, dãy, phòng, điện, hóa đơn/chi tiết, cấu hình thanh toán, đăng nhập, đăng ký, quản trị và portal khách.
- Kiểm tra các chiều rộng 320, 390, 447 (khung hiện tại), 768, 992 và 1280px. Ở 320px các trang chủ trọ, quản trị và portal khách không tràn ngang toàn trang.
- Kiểm tra mở form từ lối tắt tạo dãy/tạo phòng; footer form trên điện thoại; nút cấp link hiện có và trang khách; mở chi tiết hóa đơn; drawer menu; phân trang thẻ quản trị từ trang 1 sang trang 2.
- Kiểm tra TypeScript và production build: thành công. Vẫn có cảnh báo kích thước chunk dùng chung từ Vite; không có lỗi build.
- Phiên kiểm tra chỉ thay đổi giao diện và phiên đăng nhập mẫu, không tạo phòng, phát hành hóa đơn, đổi trạng thái chủ trọ, thu hồi link hay thực hiện thanh toán.
- Trang trạng thái tài khoản và lỗi được rà soát qua mã; chưa kiểm tra trực quan bằng tài khoản chờ duyệt trong phiên này.


## Bổ sung: pilot evondevKit tại /rooms

Ngày 12/10/2026, người dùng đã yêu cầu áp dụng sau đợt nghiên cứu. Skill cài cục bộ tại `.agents/skills/ui-ux`, ghim commit và giữ giấy phép MIT. Trang phòng đã gom bộ lọc, chuẩn hóa kiểu nút/input/badge, làm gọn table/thẻ và modal; giữ API thật. Đã bổ sung Ant Design App provider để message/modal hoạt động. Kết quả và các giới hạn kiểm tra chi tiết ở mục 12 của `PROJECT_HANDOFF.md`; đây là trang pilot, chưa phải toàn bộ FE đã đổi theo kit.
