# Xử lý tech debt — 16/10/2026

Yêu cầu: xử lý các mục đã rà soát, ghi lại thay đổi và kiểm chứng. Không reset dữ liệu, không test ghi trên database vận hành, không gửi OTP/payOS thật. robots.txt vẫn chặn tất cả bot.

## Trạng thái phát hành

Đang kiểm chứng và chuẩn bị phát hành app; chưa coi các thay đổi app là live chỉ từ kết quả build. Những thay đổi host dưới đây đã áp dụng và kiểm tra riêng. Kết quả CI/deploy cuối cùng sẽ được bổ sung ở cuối file.

## Thay đổi

| Mục | Thực hiện | Kiểm chứng / giới hạn |
| --- | --- | --- |
| TD-01 SSH | Tài khoản `roomie-ops` dùng key + sudo; tắt root/password/keyboard-interactive, giới hạn lần thử. Firewall input chỉ mở22/80/443, giữ established/loopback/ICMP và không flush Docker tables. | Sudo từ kết nối mới PASS trước và sau hardening; nft syntax PASS, rollback timer đã hủy sau kiểm tra SSH và HTTPS health. Provider firewall không thuộc phần cấu hình host này. |
| TD-01 DB | `room_rental` chỉ migration/ownership; `roomie_app` chỉ DML/sequence, không CREATE schema hay ghi EF history. Bootstrap superuser PostgreSQL đổi tên thành `roomie_dba`, chỉ dùng cho quản trị/restore, không vào app env. | Live role flags migration/runtime đều false cho superuser/createdb/createrole; runtime có DML nhưng không CREATE schema. App sẽ dùng role mới khi image được triển khai. |
| TD-02 | Production chỉ kiểm tra pending migrations; job `Database__MigrateOnly` trước app swap dùng role migration. Migration mới chỉ thêm cột/bảng/index; rollback image giữ DB và không tự Down. | SQLite upgrade từ initial giữ dữ liệu, snapshots cả2provider; PostgreSQL disposable HTTP qua schema mới. Không tuyên bố mọi migration tương lai đều tương thích ngược. |
| TD-03 | Runner sở hữu API/database tạm cho SQLite, PostgreSQL và OTP SMTP sink; workflow chọn đủ các suite có sẵn và kiểm số skip. | SQLite75/75, PostgreSQL58 chạy/8skip có lý do SQLite-only, OTP10/10 tại checkpoint. Suite mới cũng test pagination, password và MFA. |
| TD-04 | Commit reservation OTP trước SMTP; khi gửi lỗi chỉ khôi phục reservation chưa bị verify/replace bằng transaction ngắn. Không có transaction DB đang mở khi gọi SMTP. | Fake sender kiểm tra CurrentTransaction=null; timeout/error, giữ mã cũ, resend và concurrent verify qua service/HTTP. SMTP và DB không phải giao dịch phân tán; delivery ambiguous vẫn có thể cần resend. |
| TD-05 | Maintenance job riêng mỗi10phút, batch200, giữ7ngày sau expiry; dọn registration/session/throttle, không phụ thuộc flag phát hành hóa đơn. Index expiry/window mới. | Test không xóa registration còn hiệu lực/cửa sổ cooldown. Không xóa lịch sử tài chính. |
| TD-06 | Backup toàn lượt có deadline15phút kể cả pre-deploy, kill grace30giây; systemd16phút; rclone subprocess300giây/network timeout. Last-success marker, failure hook và watchdog27giờ, SMTP TLS alert có cooldown1giờ. | Backup live sau đổi role và deadline tải xuống/check4file khớp; timeout/check-failure test không chạy retention; alert được test bằng SMTP mock, chưa khẳng định email thật đã Delivered. Recipient/config chỉ ở root-only env. |
| TD-07 | Server pagination page/pageSize tối đa100 cho invoice/admin/tenant; thứ tự có Id ổn định; totals/count tính toàn bộ filter, pending attempts chỉ trang cần thiết. UI dùng server pages cả desktop và compact/mobile. | HTTP pagination/validation và browser next-page PASS. Không truyền page giữ array contract nhưng giới hạn100dòng; client tích hợp cần dùng page để đọc lịch sử dài. |
| TD-08 | SafePath chung mọi nhánh exception, không ghi raw exception chứa dữ liệu nhạy cảm; account login budget theo hash email lưu DB, ngoài IP limiter. Đồng nhất password mới12–256 + composition. Admin TOTP/recovery một lần, secret được DataProtection bảo vệ; Production chặn admin chưa enroll ngoài auth routes. Bootstrap secret bỏ khỏi steady-state env. CSP/HSTS. | RFC6238 SHA1 vectors, anti-replay, recovery reuse, session revocation và weak password tests PASS. Admin phải tự thêm khóa vào ứng dụng xác thực và cất mã khôi phục; agent không enroll thay. CSP giữ Google Fonts đang dùng. |
| TD-09 | Error boundary cho lazy routes, retry khi tải lỗi; /me phân biệt401 với network/503; timeout API35giây/download90giây, không tự retry ghi tiền; logout lỗi không giả vờ đã xóa session. | Playwright5ca: login, lỗi /me tạm thời + retry, hết session, gate MFA, phân trang. Chỉ synthetic API, không dùng credential hay DB thật. |
| TD-10 | Base images/actions pin digest/SHA; verify build image rồi lưu artifact và publish chính image đó. Script cài backup/watchdog/disclosures, role setup/migration overlay; folder đích đọc config được duyệt riêng. | Không build lại image trong publish. OAuth/config/crypt keys vẫn là dữ liệu phục hồi riêng, không thể dựng lại từ Git. Cần restore drill định kỳ, không đồng nghĩa HA/PITR hoặc immutable storage. |

## Giảm độ lớn module

PayOsService chia theo Checkout, Subscriptions, Webhook, Cancellation, Reconciliation và Protocol; worker riêng. Owner routes chia Dashboard/Buildings/Rooms/Occupancies; Billing chia Subscription/Readings/InvoiceList/Corrections/Receipts; Reports chia Queries/Excel. Giữ chung dependencies/helper và transaction boundaries; đây là tách mã theo nghiệp vụ, không thay giao thức payOS hoặc chuyển sang microservices.

## Vận hành và phục hồi

- SSH hiện tại dùng `roomie-ops`, cùng key quản trị đã có. Không dùng lại `root@...`; SSH key CI vẫn bị giới hạn deploy command.
- Bản sao cấu hình trước hardening nằm trong thư mục root-only `/root/roomie-hardening-20261016/`. Khôi phục SSH chỉ từ sudo session đang hoạt động/console nhà cung cấp, `sshd -t` trước reload. Không bật lại root/password như quy trình thường ngày.
- Backup trước thay quyền đã upload/verify; snapshot checkpoint `rehouse-20261016T024230Z-qyj1Av`, sau đổi quyền `rehouse-20261016T024631Z-4G9tre`. Retention có thể chỉ giữ bản mới nhất cùng ngày; kiểm tra snapshot còn tồn tại trước restore.
- `/etc/rehouse/database-admin.env`, runtime/backup env và rclone config là root0600. Không chép password/token vào repo/chat. Recovery crypt password+salt vẫn được giữ riêng trên Mac như runbook backup.
- Restore dùng DBA để tạo/swap DB, restore objects dưới role migration và cấp lại runtime grants. Kiểm checksum trước khi dừng app; không test helper thay thế DB trên production để chứng minh restore.
- Khởi tạo host mới: provision app + migration overlay/role helper, sau đó chạy `deploy/install-backup.sh` bằng root với private OAuth/crypt config đã cấp quyền. Cài Caddyfile và disclosure pages; xác nhận backup/restore tạm. OAuth hết hiệu lực/mất token cần chủ tài khoản tự cấp quyền lại.
- Admin đã enroll có8recovery codes, mỗi mã một lần. Nếu mất cả authenticator và recovery codes, chỉ operator có sudo/DBA mới thực hiện quy trình khôi phục danh tính có kiểm toán; không mở endpoint public bỏ qua MFA.

## Giới hạn thực tế

Không có cam kết ứng dụng hết mọi lỗ hổng. Chưa có HA/PITR, immutable backup, pentest, hay audit OS/provider toàn diện. Không mua thêm dịch vụ hoặc tự đổi chính sách SEO. Thiết bị TOTP và việc cất recovery codes cần chủ tài khoản tự thực hiện. Bằng chứng email cảnh báo thật Delivered/restore drill định kỳ là việc vận hành tiếp theo, không được đánh dấu PASS chỉ vì unit test.
