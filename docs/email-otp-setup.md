# Xác nhận đăng ký bằng OTP email (SMTP)

## Luồng đang triển khai

Mặc định mọi đăng ký mới phải xác minh email. `POST /api/auth/register` trả HTTP202 với
`{verificationRequired:true,challengeToken,email,expiresAt,resendAvailableAt}`; chưa tạo Users/session.
`POST /api/auth/verify-registration` nhận `{challengeToken,code}`, tạo Owner Approved gói Free
sau khi mã đúng, trả HTTP201 UserDto. Người dùng đăng nhập bằng mật khẩu đã chọn.
`POST /api/auth/resend-registration` nhận `{challengeToken}` và trả thông tin thời hạn mới.
Mã/challenge ở JSON body, không đặt trong URL; OTP và mật khẩu không được lưu ở frontend.
Chỉ challenge token, email và thời hạn được lưu trong sessionStorage để tải lại trang tiếp tục nhập mã.

OTP ngẫu nhiên 6 chữ số, hết hạn sau 10 phút; challenge hết hạn sau 30 phút. Mỗi mã tối đa 5 lần sai,
gửi lại sau 60 giây, tối đa 5 email/giờ/địa chỉ; API có auth rate limit theo IP.
Mã mới vô hiệu mã cũ, đăng ký lại sau cooldown thay token/thông tin đang chờ và vẫn giữ hạn mức gửi.
Không có user chưa xác minh để đăng nhập hoặc chiếm email vĩnh viễn.
Chỉ lưu SHA256(challengeToken), SHA256(challengeToken + ':' + code), PasswordHasher hash;
token 256-bit không có trong DB, do đó không thể brute-force OTP 6 chữ số chỉ từ bản sao DB.
Xác minh và tiêu thụ mã/tạo user nguyên tử, chống replay và request đồng thời.
SMTP lỗi không tạo user; gửi lại lỗi giữ mã trước đó. Không log mã, SMTP password hoặc SMTP response.
SMTP gửi trong transaction sau reservation DB; một email đã được nhận nhưng commit DB lỗi có thể
chứa mã không dùng được. Không tự retry mail; người dùng có thể gửi lại sau cooldown.
Tài khoản có sẵn không bị buộc xác minh lại. OTP chứng minh quyền truy cập hộp thư, không xác minh danh tính pháp lý.

## Cách đơn giản để bắt đầu: Gmail riêng cho Roomie

1. Tạo/chọn một Gmail riêng dùng làm địa chỉ gửi Roomie.
2. Bật Xác minh 2 bước tại https://myaccount.google.com/security .
3. Mở https://myaccount.google.com/apppasswords , đặt tên Roomie OTP, tạo mật khẩu ứng dụng.
   Nếu không thấy mục này, xem điều kiện tài khoản tại [hướng dẫn Google](https://support.google.com/accounts/answer/185833?hl=vi).
4. Mở `backend/RoomRental.Api/appsettings.Email.local.json` đã chuẩn bị sẵn (file bị Git bỏ qua, quyền 0600).
   Điền Email.FromAddress và Email.Smtp.Username bằng cùng Gmail; điền Email.Smtp.Password
   bằng mật khẩu ứng dụng vừa tạo. Không dùng mật khẩu đăng nhập Gmail, không gửi mật khẩu qua chat.
5. Cấu hình Gmail đã có sẵn: Host=smtp.gmail.com, Port=587, Security=StartTls, FromName=Roomie.
   Lưu file; backend Development đọc lại cấu hình khi file đổi.
6. Mở http://127.0.0.1:5173/register và tự đăng ký bằng một email bạn nhận được thư.
   Kiểm tra Inbox/Spam, nhập mã và đăng nhập sau khi xác nhận thành công.

File này chỉ được nạp trong Development. Chưa có thông tin SMTP hợp lệ thì đăng ký trả503,
không tự bỏ qua OTP hoặc báo đã gửi thành công. Tài khoản hiện có vẫn dùng bình thường.

## VPS / Production

Cấu hình biến trong `/etc/rehouse/runtime.env` (root quản lý, chmod 0600):

```dotenv
SMTP_FROM_ADDRESS=
SMTP_FROM_NAME=Roomie
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURITY=StartTls
SMTP_USERNAME=
SMTP_PASSWORD=
```

Điền các giá trị thật trên host, không commit vào Git. Compose mới ánh xạ chúng sang Email__*.
Host cũ cần cập nhật `/opt/rehouse/compose.yaml` theo `deploy/compose.yaml` rồi recreate app với
image digest đã được kiểm tra; chỉ thêm biến vào runtime.env của compose cũ chưa đủ.
Không tự triển khai/cấu hình VPS trong đợt OTP này. Có thể dùng SMTP email tên miền bằng cách đổi
host/username/password/from theo nhà cung cấp; cổng 465 dùng SslOnConnect. Production luôn yêu cầu
StartTls hoặc SslOnConnect với kiểm tra chứng chỉ mặc định. SMTP không mã hóa chỉ được phép
trong Development khi host là localhost/127.0.0.1/::1 phục vụ QA.

Schema nâng cấp thêm bảng RegistrationVerifications, không sửa dữ liệu Users/Invoices cũ.
DbMigrator hỗ trợ snapshot có hoặc chưa có bảng này, giữ source read-only.
Backup/khôi phục bảo vệ cả bản đăng ký đang chờ vì có password hash trong đó.
Hãy sao lưu và kiểm tra DB riêng trước khi cập nhật host thật.

## Kiểm thử an toàn

`dotnet run --project tests/RoomRental.WebhookTests` kiểm tra OTP bằng sender giả và clock điều khiển,
không có email/provider thật. HTTP OTP fixture opt-in: `tests/otp_smtp_fixture.py` chỉ bind loopback,
không relay, ghi OTP của dữ liệu giả trong outbox /tmp quyền 0700/0600. Xem tests/README.md.
Chỉ tắt OTP để chạy các test nghiệp vụ cũ bằng EmailVerification__Enabled=false trên API Development
với DB disposable; Production từ chối khởi động nếu cố tắt.

Dependency SMTP: [MailKit](https://github.com/jstedfast/MailKit). Pkcs được ghim 10.0.13 để tránh
cảnh báo dependency đã được Microsoft công bố: [advisory](https://github.com/advisories/GHSA-846f-f764-76mx).

## Brevo đã cấu hình trên VPS (14/10/2026)

Production dùng noreply@roomie.io.vn, FromName Roomie, smtp-relay.brevo.com:587 với StartTls. Tên miền/sender đã được Brevo xác thực qua DNS P.A; SMTP secret nằm trong runtime.env quyền0600, không đưa vào Git. Compose trên VPS đã có7 biến Email__* tương ứng. SMTP TLS/authentication thành công, một thư kiểm tra đã đượcSMTP tiếp nhận; giao nhận Gmail và luồngOTP thật chưa được xác nhận. Xem mục43 PROJECT_HANDOFF.md trước khi kiểm tra tiếp; không tự gửi lại thư thử.

## Hiện tại: Resend đã thay Brevo trên VPS (14/10/2026)

Roomie production dùng Resend qua smtp.resend.com:587, StartTls, username resend và khóa chỉ có Sending access cho roomie.io.vn. From noreply@roomie.io.vn, FromName Roomie. Khóa nằm riêng trong runtime.env0600; không đưa vào source. Tên miền đãverified, hai thư kiểm tra tới hai Gmail có trạng tháiDelivered ởResend. Khác với phầnBrevo lịch sử ởtrên, đãcóbằngchứngmáychủnhậntiếpnhận.

Xem mục46PROJECT_HANDOFF.md vềbackup/rollback vàphạmvitest. Chưa tạotàikhoảnthậtquaOTP trongđợtnày. LocalDevelopment vẫnchưacấuhìnhSMTP.
