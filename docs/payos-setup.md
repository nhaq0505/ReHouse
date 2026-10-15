# Hướng dẫn thiết lập cổng thanh toán payOS cho Chủ trọ

Tài liệu này hướng dẫn chi tiết cách chủ trọ đăng ký tài khoản tại [payOS](https://payos.vn), liên kết ngân hàng nhận tiền qua VietQR, lấy các khóa kết nối và thiết lập tự động gạch nợ trên hệ thống **Roomie (Quản Lý Phòng)**.

---

## 1. Đăng ký & lấy khóa kết nối trên payOS (payos.vn)

[payOS](https://payos.vn) là cổng thanh toán mở hỗ trợ tạo mã VietQR động, tiền được chuyển **trực tiếp 100% vào tài khoản ngân hàng của chủ trọ** ngay khi người thuê quét mã, không qua ví trung gian hay bị giam tiền.

### Bước 1: Tạo tài khoản payOS
1. Truy cập trang chủ [https://payos.vn](https://payos.vn) và bấm nút **Đăng ký**.
2. Nhập thông tin tài khoản:
   - **Email**: Dùng email thường xuyên sử dụng để nhận thông báo giao dịch.
   - **Mật khẩu**: Tạo mật khẩu mạnh, an toàn.
3. Kiểm tra hòm thư email và bấm vào liên kết kích hoạt để xác nhận tài khoản.
4. Lựa chọn loại tài khoản phù hợp:
   - **Tài khoản Cá nhân**: Phù hợp cho chủ nhà trọ, căn hộ cho thuê cá nhân hoặc hộ gia đình (thủ tục nhanh gọn, chỉ cần CCCD và tài khoản ngân hàng chính chủ).
   - **Tài khoản Doanh nghiệp / Hộ kinh doanh**: Dành cho các công ty quản lý vận hành chuỗi căn hộ, nhà trọ có giấy phép kinh doanh.

### Bước 2: Liên kết tài khoản ngân hàng nhận tiền (VietQR)
1. Đăng nhập vào bảng điều khiển payOS.
2. Tại thanh menu bên trái, chọn **Tài khoản ngân hàng** (hoặc **Cài đặt thanh toán** → **Tài khoản nhận tiền**).
3. Bấm **Thêm tài khoản ngân hàng** / **Liên kết ngân hàng**:
   - Chọn ngân hàng bạn đang sử dụng (hỗ trợ hầu hết các ngân hàng lớn như MBBank, VietinBank, BIDV, TPBank, VPBank, Techcombank, Vietcombank...).
   - Nhập **Số tài khoản** và kiểm tra **Tên chủ tài khoản** đảm bảo khớp với thông tin đăng ký.
4. Hoàn tất các bước xác thực theo hướng dẫn của payOS.
   > [!NOTE]
   > Tiền khách thuê thanh toán hóa đơn sẽ vào thẳng số tài khoản ngân hàng này. Roomie không giữ tiền và không thu phí giao dịch qua cổng của bạn.

### Bước 3: Tạo kênh thanh toán và lấy bộ 3 khóa kết nối
1. Trong giao diện payOS, vào mục **Kênh thanh toán** (Payment Channels).
2. Bấm **Tạo kênh thanh toán mới** (hoặc sử dụng kênh mặc định có sẵn):
   - **Tên kênh**: Đặt tên dễ nhớ (ví dụ: `Nhà trọ Roomie` hoặc tên khu trọ của bạn).
   - **Tài khoản nhận tiền**: Chọn tài khoản ngân hàng đã liên kết ở Bước 2.
3. Sau khi tạo kênh thành công, bấm vào chi tiết kênh và chuyển sang tab **Cài đặt API** (hoặc **Thông tin kết nối**).
4. Bạn sẽ thấy 3 thông tin bảo mật quan trọng:
   - **Client ID**: Chuỗi định danh công khai của kênh kết nối.
   - **API Key**: Khóa truy cập API của bạn.
   - **Checksum Key**: Khóa bí mật dùng để tạo và xác thực chữ ký số HMAC-SHA256 cho các giao dịch và webhook.
5. Sao chép (copy) cẩn thận cả 3 chuỗi ký tự này để chuẩn bị cấu hình vào Roomie.
   > [!WARNING]
   > Tuyệt đối không chia sẻ `API Key` và `Checksum Key` cho người lạ. Bất kỳ ai có 2 khóa này đều có thể tạo đơn hàng hoặc giả mạo thông tin dưới danh nghĩa kênh thanh toán của bạn.

---

## 2. Hướng dẫn cấu hình cho Chủ trọ trên giao diện Web Roomie

Sau khi đã có bộ khóa từ payOS, chủ trọ tiến hành kích hoạt tính năng thanh toán tự động trong Roomie.

### Đường dẫn truy cập
1. Đăng nhập vào tài khoản Chủ trọ trên hệ thống Roomie.
2. Trên thanh điều hướng (Menu bên trái), bấm vào mục **Cài đặt thanh toán**.
   - Hoặc truy cập trực tiếp đường dẫn: `/settings/payment`.

### Các bước nhập thông tin & kích hoạt
1. Tại thẻ **Cấu hình payOS**, nhập chính xác các thông tin đã lấy từ payOS:
   - **Client ID**: Dán chuỗi Client ID từ payOS.
   - **API Key**: Dán chuỗi API Key từ payOS.
   - **Checksum Key**: Dán chuỗi Checksum Key từ payOS.
2. Bấm nút **Lưu và xác minh payOS**.
3. Hệ thống sẽ hiển thị trạng thái `Đang lưu và xác minh…` trong vài giây và trả về kết quả ngay trên màn hình.

> [!IMPORTANT]
> **Quy định cấp link cho khách thuê**:
> Hệ thống bắt buộc chủ trọ phải lưu cấu hình và xác minh webhook payOS thành công (trạng thái **Webhook đã được payOS xác minh**) thì mới được phép **Cấp link cho khách**.
> Nếu chưa lưu hoặc webhook chưa được xác minh, nút **"Cấp link cho khách"** tại trang **Phòng & người thuê** sẽ chặn thao tác và hiển thị hộp thoại hướng dẫn chủ trọ đến trang **Cài đặt thanh toán** để hoàn tất thiết lập. Đồng thời, API phía backend cũng chặn các yêu cầu tạo/cấp lại link khách nếu kênh thanh toán chưa sẵn sàng.

---

## 3. Cơ chế hoạt động & Bảo mật phía sau

Khi chủ trọ bấm **Lưu và xác minh payOS**, hệ thống Roomie tự động thực hiện các cơ chế sau:

1. **Mã hóa khóa bí mật an toàn (Encryption at Rest)**:
   - `API Key` và `Checksum Key` được mã hóa ngay lập tức ở phía máy chủ bằng công nghệ **ASP.NET Core Data Protection** trước khi ghi vào cơ sở dữ liệu.
   - Hệ thống **không bao giờ trả lại** `API Key` hay `Checksum Key` về phía giao diện người dùng. Khi xem lại trang, các ô mật khẩu sẽ được để trống nhằm bảo vệ tuyệt đối an toàn thông tin của chủ trọ.

2. **Tự động đăng ký Webhook (Auto Confirm Webhook)**:
   - Backend Roomie tự sinh một địa chỉ Webhook riêng biệt cho từng chủ trọ theo định dạng:
     `https://<domain>/api/payments/webhook/{ownerId}`
   - Hệ thống tự động gửi yêu cầu đến máy chủ `https://api-merchant.payos.vn/confirm-webhook` kèm theo `Client ID`, `API Key` và địa chỉ URL Webhook trên.
   - Chủ trọ **không cần phải dán URL thủ công** lên trang quản trị của payOS. Nếu mọi thông số chính xác và máy chủ truy cập được từ Internet, payOS sẽ lập tức kích hoạt webhook.

---

## 4. Các trạng thái hiển thị của Webhook

Giao diện tại trang `/settings/payment` sẽ hiển thị một trong ba trạng thái thông qua thẻ thông báo (Alert) và chấm trạng thái:

| Trạng thái | Màu sắc / Biểu tượng | Ý nghĩa & Hướng xử lý |
| :--- | :--- | :--- |
| **Chưa lưu cấu hình** | **Màu xám / Xanh nhạt (Info)** <br/> Chấm xám: `Chưa lưu cấu hình` | Chủ trọ chưa từng nhập hoặc chưa lưu thông tin payOS. Chưa được phép cấp link cho khách. <br/> 👉 **Xử lý**: Nhập đầy đủ 3 trường thông tin và bấm **Lưu và xác minh payOS**. |
| **Webhook đã được payOS xác minh** | **Màu xanh lá (Success)** <br/> Chấm xanh: `Webhook đã xác minh` | **Kênh thanh toán đã hoạt động hoàn hảo! Đã mở khóa tính năng cấp link cho khách.** <br/> PayOS đã ghi nhận và xác minh thành công URL webhook của bạn. <br/> 👉 Chủ trọ có thể vào mục **Phòng & người thuê** bấm **Cấp link cho khách**. Người thuê khi mở link phòng có thể quét mã VietQR để thanh toán. Hóa đơn sẽ tự động chuyển sang trạng thái **Đã thanh toán** chỉ sau 2–3 giây. |
| **Đã lưu cấu hình — webhook chưa sẵn sàng** | **Màu vàng cam (Warning)** hoặc **Đỏ (Failed)** <br/> Chấm vàng: `Webhook chưa sẵn sàng` | Cấu hình khóa đã được lưu an toàn, nhưng payOS chưa thể xác minh webhook URL. Hệ thống vẫn chặn cấp link cho khách để tránh lỗi khi người thuê thanh toán. Thường do các nguyên nhân: <br/> • **Nhập sai khóa**: Kiểm tra lại Client ID, API Key hoặc Checksum Key xem có bị thừa dấu cách hay thiếu ký tự không. <br/> • **Máy chủ chưa có HTTPS công khai**: payOS bắt buộc Webhook URL phải chạy giao thức `https://` và có thể truy cập từ Internet. <br/> 👉 **Xử lý**: Sau khi kiểm tra lại thông tin, bấm nút **Xác minh lại webhook** để hệ thống thử đăng ký lại. |

---

## 5. Thử nghiệm thanh toán (Kiểm chứng hoạt động)

Sau khi thấy thông báo xanh **"Webhook đã được payOS xác minh"**, bạn có thể kiểm tra thực tế:
1. Vào menu **Hóa đơn**, chọn một hóa đơn đang chờ thu (hoặc tạo một hóa đơn thử nghiệm với số tiền nhỏ, ví dụ 10,000 đ).
2. Mở **Liên kết khách thuê** của phòng tương ứng (dạng `/t/{token}`).
3. Khách thuê bấm vào hóa đơn → Chọn **Thanh toán trực tuyến**.
4. Quét mã VietQR bằng ứng dụng ngân hàng và hoàn tất chuyển khoản.
5. Quan sát: Màn hình khách thuê sẽ tự động chuyển sang thông báo **"Thanh toán thành công"**, và trên trang quản lý của chủ trọ, hóa đơn tự động được cập nhật thành **"Đã thanh toán"** với phiếu thu tương ứng.
