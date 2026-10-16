# Runbook tăng trưởng nhanh Rehouse


**Hardening update16/10:** see the release record for current status. Production migrations use a separate deployment job/identity; account login budgets persist in DB; invoice/admin/tenant pages use server pagination; backup has deadlines/failure alerts/staleness watchdog. The older architecture bullets below are historical where superseded. IP limiters and billing/payment workers remain process-local; this is a single-instance deployment, not HA. Mock tests do not establish real email delivery or wider production telemetry.

Cập nhật hiện trạng:16/10/2026; số đo tải bên dưới vẫn là QA lịch sử13/10. Đây là kế hoạch ứng phó và điều kiện mở rộng, không phải tuyên bố app đã sẵn sàng production. Không triển khai thay đổi, khởi động lại dịch vụ, tạo payment hoặc chạy migration chỉ bằng việc đọc runbook này. Nhật ký mới nhất: [migrations](ef-core-migrations.md), [backup Drive/restore](backup-operations.md), [bảo mật/tech debt](tech-debt-remediation-2026-10-16.md).

## Tóm tắt hiện trạng

- Local đang dùng PostgreSQL; SQLite vẫn được hỗ trợ bằng migration riêng. Compose dùng PostgreSQL17 nhưng chỉ có một container app, một DB và volume cục bộ. FE được phục vụ cùng origin từ app. Compose hiện không phải topology HA; `docker compose up --scale app=...` sẽ đụng port publish và không tạo được shared volume liên máy.
- PostgreSQL QA gần nhất: 16/16 API integration pass; hai lượt chỉ đọc overview của một tenant tổng hợp đạt lần lượt 1.412 req/s và 1.401 req/s ở 50/100 worker, p95 44,8/92,0 ms. Đây là tải nóng cùng máy, không đại diện nhiều khách, dữ liệu dài, mạng công khai hay mức tải production. Không dùng làm cam kết số người dùng hoặc ngưỡng autoscale. Xem [báo cáo QA](POSTGRES_QA.md).
- Backend chạy EF Core `MigrateAsync` với lịch sử migrations/snapshots theo provider. Vẫn chưa tách migration thành job triển khai có identity riêng; không coi startup migration là giải pháp hoàn chỉnh cho nhiều replica. Không đổi SQLite sang PostgreSQL bằng cách chỉ đổi connection string: tạo schema không tự chuyển dữ liệu.
- Rate limiter auth (mặc định Production 10 request/phút/IP) và `tenant-payment` (12/phút/IP) đang ở bộ nhớ từng process. Nhiều replica sẽ nhân hạn mức và trạng thái không dùng chung; IP client chỉ đáng tin sau proxy được khai báo trong `TRUSTED_PROXIES`.
- Checkout page hiện làm mới overview khoảng 5 giây, đối soát khoảng 20 giây khi đang chờ và tab hiển thị; FE đã backoff lỗi/429 và dừng auto-reconcile sau nhiều lỗi liên tiếp. Đây là hành vi mã hiện tại, không có cờ runtime để vận hành viên chỉnh interval.
- Mỗi app process chạy cả `InvoiceSweepService` (khởi chạy ngay, sau đó 24 giờ) và `PaymentReconciliationHostedService` (chờ 1 phút, rồi chạy batch tuần tự cách khoảng 3 phút). Không có leader/lease phân tán. Batch payment chọn 12 attempt Pending cũ nhất mỗi lần; lỗi lặp lại có thể giữ chỗ và làm đói các attempt sau. Không tăng replica hoặc chỉ tăng batch size để xử lý backlog.
- `/api/health` kiểm tra kết nối database và trả200/503; không kiểm chứng backlog job, payOS hoặc tính toàn vẹn dữ liệu. Repo chưa có dashboard/alert production cho p95, pool DB, backlog job, payOS429 hay chênh lệch tiền. Các ngưỡng bên dưới đều là **đề xuất**, chưa được cấu hình hay đo trên production.
- Backup PostgreSQL+DataProtection đã lên Google Drive qua crypt, daily03:00–03:20VN và pre-deploy; restore từ snapshot giải mã vào PostgreSQL17 tạm đã PASS. Đây chưa phải HA/PITR hoặc cam kết RPO/RTO đã đo; giám sát thất bại backup/alert ngoài máy vẫn cần hoàn thiện.
- Một số danh sách API chưa phân trang; tổng quan và danh sách phòng/hóa đơn có thể đọc lịch sử dài. Trước khi dự báo tăng trưởng phải đo truy vấn nhiều tenant và dữ liệu thực tế đã ẩn danh.

## Checklist trước khi mở dịch vụ công khai

Đây là go/no-go checklist; chưa được xem là hoàn tất chỉ vì compose dựng chạy được.

- [ ] Có người trực kỹ thuật và người quyết định vận hành/thanh toán; có kênh cập nhật sự cố và lịch trực.
- [ ] Domain/HTTPS, reverse proxy, `TRUSTED_PROXIES`, same-origin/CSRF, webhook HTTPS và callback đã thử trong môi trường phù hợp.
- [ ] PostgreSQL đang dùng backup tự động phù hợp RPO/RTO đã được người chịu trách nhiệm duyệt; restore drill gần nhất thành công.
- [ ] PostgreSQL và DataProtection key ring được backup/restore cùng nhau; quyền đọc key ring được giới hạn, at-rest protection được kiểm chứng.
- [ ] Schema migrations có version, runner một lần, forward/rollback plan; không chạy DDL nâng cấp tùy ý trên app replicas.
- [ ] Metrics/logs có API p50/p95/p99, 5xx/429 theo route, DB pool/lock/disk, job lag, payOS errors và pending age; alert được diễn tập.
- [ ] Có readiness check kiểm DB, traffic drain, image digest trước/sau, và lệnh rollback app đã thử trên staging.
- [ ] Hosted jobs có leader/lease hoặc worker riêng; reconciliation có backoff/fairness/per-owner/provider limit và backlog alert.
- [ ] Rate-limit/abuse control có phạm vi toàn hệ thống hoặc ở edge; aggregate limit đã kiểm thử với số replica dự kiến.
- [ ] Kiểm thử tải staging đại diện nhiều owner, lịch sử dài, burst, đọc/ghi, job và provider sandbox; ghi rõ host, dataset, version, ngưỡng và kết quả.
- [ ] Luồng payment/webhook có kiểm thử signature, amount, order, duplicate, timeout/uncertain POST, 429, manual reconcile và invoice-authoritative success.
- [ ] Quy trình chủ trọ/khách khi gián đoạn được viết sẵn; không yêu cầu gửi screenshot/chuyển tiền làm bằng chứng để app tự đánh dấu Paid.
- [ ] Người duyệt ngân sách hạ tầng, PostgreSQL, backup, egress/monitoring và giới hạn scale được nêu tên; không lấy throughput QA cục bộ làm ngân sách/capacity.

## Vai trò trong sự cố

Phân công trước khi mở dịch vụ công khai; nhóm nhỏ có thể kiêm vai nhưng phải ghi rõ ai quyết định:

| Vai trò | Trách nhiệm |
| --- | --- |
| Incident lead | Mở timeline, xác định mức độ, điều phối cập nhật, quyết định giới hạn lưu lượng/rollback. |
| App operator | Quan sát gateway/API, phiên bản image, latency/5xx/429, cấu hình thay đổi; giữ bản triển khai trước. |
| DB operator | Kiểm tra pool, truy vấn chờ/lock/disk, snapshot và khôi phục PostgreSQL; không chạy DDL thủ công khi chưa có kế hoạch. |
| Payment owner | Đối chiếu payOS/webhook với `PayOsAttempts`, `Receipts`, `Invoices`; quyết định việc thông báo chủ trọ/khách. |

Không ghi cookie, token khách, API key/checksum key, chuỗi kết nối, QR có thể thanh toán hoặc dữ liệu khách không cần thiết vào ticket/log/screenshot.

## Ngưỡng cảnh báo đề xuất

Đây là điểm bắt đầu để duyệt sau khi có telemetry và baseline ổn định tối thiểu một tuần. Chưa có công cụ trong repo thu thập các chỉ số này; không áp dụng chúng như tính năng sẵn có.

| Tín hiệu đề xuất | Ngưỡng mở incident | Hành động đầu tiên |
| --- | --- | --- |
| Lưu lượng | Request/s của route tăng ≥10× median 30 phút trước đó trong 2 phút liên tiếp **và** p95 tăng hoặc 5xx tăng. | Xem route/IP/tenant nào tạo tải; giữ nguyên dịch vụ thanh toán đến khi biết thành phần gây tải. |
| Độ trễ API | p95 >1 giây và >2× baseline trong 5 phút, với ≥100 request/5 phút. | Tách route đọc, checkout, reconcile, webhook; kiểm tra DB và pool trước khi scale app. |
| Lỗi API | HTTP 5xx ≥2% và ít nhất 20 lỗi trong 5 phút. | Chụp log theo request/trace ID đã khử dữ liệu; không retry mutation hàng loạt. |
| Throttling | HTTP 429 ≥1% trong 5 phút từ lưu lượng hợp lệ. | Tìm limiter theo IP/route và người dùng chia sẻ NAT; không tăng toàn bộ hạn mức. |
| PostgreSQL | Pool/connection sử dụng ≥80% trong 5 phút, hoặc truy vấn/lock chờ vượt ngưỡng SLO đã duyệt. | Xác định query/lock đang chiếm connection; không thêm app replica trước ngân sách kết nối DB. |
| Thanh toán | Provider 429/5xx tăng liên tiếp, attempt Pending lâu hơn 15 phút, hoặc job fail nhiều vòng. | Hạn chế create mới nếu cần; giữ webhook và đối soát thủ công. Điều tra batch cũ nhất 12. |
| Toàn vẹn tiền | Bất kỳ receipt không khớp invoice/order/amount, trùng provider reference hoặc dữ liệu không giải thích được. | Mức nghiêm trọng cao nhất: khóa thao tác thu/checkout có kiểm soát; giữ webhook; dừng deploy và đối soát từng attempt. |

Ngưỡng p95/5xx/429/pool/backlog là ngưỡng **đề xuất**, không phải đã đo được. 10× chỉ là tín hiệu burst; nó không xác định số người dùng hoặc khả năng hiện tại.

## Quy trình khi có burst 10×

### Phút 0–5: xác minh và giữ bằng chứng

1. Incident lead mở sự cố, ghi giờ bắt đầu, khu vực/route, phiên bản image gần nhất và ai đang trực. Tạm dừng release, migration, thay đổi payOS/proxy không liên quan.
2. Xác nhận burst qua access log/edge metrics. Phân biệt asset/static, tenant overview/list, đăng nhập, checkout create, reconcile và webhook. Health `200` chỉ chứng minh process trả lời.
3. Đối chiếu API p95/5xx/429, CPU/RAM, request queue, PostgreSQL connection/CPU/lock/disk, app logs, outbound payOS status. Chỉ chạy read-only health/checks; không chạy fixture, register/load test, payment create hay webhook giả trên dữ liệu thật.
4. Với payment alert, lưu counts/status/order codes đã che dữ liệu cần thiết; đối chiếu số attempt Pending/Paid/Failed, receipt và invoice. Không ghi token/credentials vào incident channel.

### Phút 5–15: giảm tải có mục tiêu

1. Nếu là crawler/abuse, dùng WAF/reverse proxy hiện có để rate-limit nguồn/route cụ thể. Compose hiện chưa có WAF hoặc reverse proxy cấu hình sẵn; nếu chưa có edge control, đây là thay đổi triển khai cần chuẩn bị, không có lệnh nhanh trong app.
2. Nếu API đọc đang chiếm DB, giới hạn các list/dashboard đắt ở edge hoặc đưa trang đó vào maintenance tạm. Không cache dữ liệu hóa đơn/portal theo token ở cache dùng chung; không tắt phân quyền/scope.
3. Nếu outbound payOS bị giới hạn hoặc API 502/429, tạm chặn **checkout create mới** bằng điều khiển edge đã kiểm thử hoặc hotfix có review; hiển thị trạng thái đang gián đoạn. Không retry POST create vô hạn: request timeout/429 có thể để attempt Pending do kết quả chưa chắc chắn, backend phải reconcile order cũ trước khi retry.
4. Giữ nguyên `POST /api/payments/webhook/{ownerId}` nhận callback hợp lệ. Giữ đường đối soát thủ công cho chủ trọ (`POST /api/invoices/{id}/reconcile`) và khách (`POST /api/tenant/{token}/invoices/{id}/reconcile`) nếu DB còn đủ sức. Không chặn cả payOS ingress hay toàn bộ `/api/payments`.
5. Giảm tự động polling chỉ khi đã có thay đổi code/cấu hình đã review, build và triển khai. Hiện không có env flag để đổi chu kỳ FE hoặc pause scheduled reconciliation; không giả định restart tạo chế độ giảm tải. Khi chỉnh, giảm GET reconcile trước, giữ webhook và nút manual check, đặt backoff/jitter và giới hạn theo owner/provider.
6. Kiểm tra tuổi backlog sau mỗi vòng. Worker hiện lấy 12 attempt cũ nhất, tuần tự; những order lỗi có thể liên tục chiếm batch. Không tăng `Take(12)` một mình. Fix đúng cần `NextCheckAt`, retry/backoff, phân trang/cursor hoặc lease/claim, fairness theo owner, giới hạn tổng request payOS và alert tuổi attempt.

### Phút 15–60: ổn định DB và thanh toán

1. Nếu DB pool/lock là nút thắt, giảm concurrency ở edge, xác định query và transaction đang chờ, xem slow query. Không tăng số app process để “chia tải” trước khi biết pool/connection budget; số connection tối đa của các replica cộng lại phải nằm trong giới hạn DB còn chừa chỗ cho admin/backup.
2. Nếu API lỗi sau deploy, dùng artifact image trước đó chỉ khi schema mới đã chứng minh tương thích ngược. Quay code không đồng nghĩa rollback schema. Không xóa cột, chạy `down -v`, xóa volume hoặc phục hồi bản DB cũ để sửa 5xx.
3. Nếu DB cần sửa, chụp backup/snapshot có timestamp và hash; thử restore vào DB cô lập; kiểm tra integrity, counts, các tổng tiền, receipt/order uniqueness và DataProtection trước khi phê duyệt cutover.
4. Payment owner chỉ xác nhận thanh toán từ webhook đã kiểm chữ ký và scope/order/amount, hoặc đối soát phía server thành công. `PAID` từ browser/provider, ảnh chuyển khoản, trang return, status log hoặc QR không đủ để gạch nợ. Không tự đặt invoice Paid, xóa attempt Pending hay ghi receipt “để qua sự cố”.
5. Khi provider/outbound không ổn định, thông báo rằng cập nhật có thể chậm; giữ order Pending cho tới khi reconcile. Ghi nhận tiền ngoài chỉ theo nghiệp vụ hiện có và sau khi pending online được giải quyết/đối soát, tránh ghi hai lần.

## Mẫu diễn tập: traffic gấp 10 lần trong vài phút

Kịch bản giả định: 10× GET từ nhiều khách cùng lúc tải portal và hóa đơn; p95 vượt ngưỡng đề xuất, DB connection đạt 85%, chưa thấy chênh lệch tiền. Đây là playbook tương lai, không phải sự cố đã xảy ra.

1. Incident lead đóng băng release, xác nhận route GET và lấy snapshot metric/log 5 phút; app operator kiểm tra DB pool, slow query và 429. Payment owner xác nhận webhook ingress vẫn nhận được.
2. Nếu có crawler/IP nóng: edge chặn/rate-limit đúng nguồn. Nếu tải hợp lệ: giới hạn tạm route/list gây nặng, thông báo bảo trì; không cache invoice/tenant response cross-token.
3. Nếu checkout/reconcile cũng tăng: tạo mới có thể tạm trả unavailable bằng edge rule/hotfix; giữ webhook, manual reconcile, và GET overview nếu DB chịu được. Không tắt callback.
4. DBA giảm truy vấn cạnh tranh bằng cách xử lý query/lock cụ thể; không tăng replica khi chưa biết connection ceiling. Nếu app CPU cao còn DB dư, scale app chỉ sau checklist multi-instance bên dưới.
5. Sau khi p95/5xx dưới ngưỡng đề xuất 15 phút và DB trở về an toàn, gỡ giới hạn theo từng route, theo dõi thêm 30 phút. Payment owner đối chiếu mọi order phát sinh trong cửa sổ sự cố; không tạo transfer để “test”.
6. Trong 24 giờ, lưu timeline, ảnh metric đã loại dữ liệu nhạy cảm, image digest, cấu hình đổi, số lượng pending/payment/invoice trước-sau, root cause, rollback/mitigation và owner/ETA cho follow-up.

## SQLite → PostgreSQL: kế hoạch chuyển đổi, không làm giữa incident

1. Không chỉ đổi `DatabaseProvider`/connection string. `MigrateAsync` tạo/nâng schema PostgreSQL nhưng không chuyển dữ liệu SQLite. Cả hai provider đã có migration/snapshot; công cụ DbMigrator import tạo target bằng migrations. Xem nhật ký cutover trước khi xử lý snapshot legacy.
2. Trước khi mở rộng nhiều instance, tách bước apply migration đơn và identity triển khai khỏi runtime; mỗi migration mới vẫn cần kiểm tra kiểu dữ liệu, UUID, `numeric`, timestamp/timezone, index lọc, unique/idempotency và foreign key trên cả hai provider.
3. Dựng staging từ bản sao đã khử dữ liệu. So sánh số dòng theo bảng/owner, kỳ hóa đơn, tổng `Total/Paid/Outstanding`, receipts, deposit settlements, `PayOsAttempts`, `ProcessedWebhooks`, payment settings và webhook registrations. Kiểm thử callback/replay fixture bằng fake handler chỉ trên DB/test provider tách biệt.
4. Lên lịch maintenance/write freeze. Tạo backup SQLite nhất quán (dùng SQLite online backup/checkpoint khi cần), kiểm integrity và checksum; export/import vào PostgreSQL; giữ DB SQLite gốc chỉ đọc. Có kế hoạch quay lại và cách xử lý writes phát sinh sau cutover.
5. Sao lưu PostgreSQL cùng DataProtection key ring ở cùng restore point/quy trình bảo vệ. PostgreSQL backup không bao gồm volume `/app/data/keys`; mất key ring có thể làm mất khả năng giải mã khóa payOS/token đã bảo vệ và vô hiệu hóa session. Giữ key ring mã hóa/ACL phù hợp và chia sẻ bền vững trước khi chạy nhiều instance.
6. Restore rehearsal vào môi trường cô lập bắt buộc trước cutover. Chỉ chuyển DNS/traffic sau khi integrity, row counts, số tiền, login, token cũ và webhook config đã kiểm chứng. Sau lần ghi đầu tiên ở PostgreSQL, không quay về SQLite cũ nếu chưa chuyển/đối soát toàn bộ delta; rollback chỉ bằng việc đổi connection string có thể làm mất writes.

Với PostgreSQL 17 có thể dùng `pg_dump`/`pg_restore` cho backup logic và rehearsal; backup toàn cluster/role cần quy trình riêng. Đọc tài liệu [Backup and Restore PostgreSQL 17](https://www.postgresql.org/docs/17/backup.html) và [pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html). EF Core ghi rõ `EnsureCreated` và migrations không phối hợp tốt, và chuyển đổi sang migrations không liền mạch: [EnsureCreated](https://learn.microsoft.com/en-us/ef/core/managing-schemas/ensure-created).

## Điều kiện bắt buộc trước khi scale ra nhiều app instance

Không bật nhiều replica chỉ vì PostgreSQL đã có. Từng mục cần chủ sở hữu, kiểm tra staging và ngày hoàn tất:

- **Schema:** tạo/kiểm thử EF migrations hoặc versioned SQL migrations; chạy một lần qua migration job, không để mọi app instance chạy DDL khi startup. Back up và restore drill trước rollout.
- **DataProtection:** lưu key ring bền vững, dùng chung an toàn giữa replicas và deployment, đặt application name/discriminator ổn định, mã hóa at rest/giới hạn đọc; kiểm chứng cookie, tenant token và payOS credentials đều unprotect được trên instance khác. DB và keys có backup/restore đồng bộ. Xem [ASP.NET Core key management](https://learn.microsoft.com/en-us/aspnet/core/security/data-protection/configuration/default-settings?view=aspnetcore-10.0).
- **Jobs:** chuyển invoice sweep/reconciliation ra worker duy nhất hoặc có DB lease/advisory lock, graceful shutdown, retry/backoff, fairness, metrics backlog và exactly-once effect qua idempotency. Không chạy mỗi hosted service ở tất cả web replica.
- **Limiter:** chuyển giới hạn abuse/rate-limit sang edge hoặc distributed limiter; quyết định rõ key (IP, owner, route), forwarded IP chỉ tin proxy đã allowlist. Kiểm thử tổng hạn mức khi có N replicas.
- **DB:** đặt connection pool budget theo tổng replica; đo query plan, pool waits, lock/long transactions, disk, backup I/O; có pool/replica alert và runbook failover. DB vẫn là nguồn dữ liệu chính; không dùng cache cho quyết định Paid.
- **HTTP/gateway:** HTTPS, TLS, trusted proxy chuẩn, deploy drain/readiness có DB check; `/api/health` tĩnh hiện tại chưa đủ readiness. Có request/trace ID và log đã khử secrets/PII.
- **Payment:** thử sandbox/provider test tách biệt cho timeout, 429, duplicate webhook, amount/order mismatch, pending lâu; có kill switch đã thử cho checkout mới và knob polling/worker, nhưng luôn để ingress webhook và manual reconcile hoạt động. Không vận hành bằng fake success.
- **Scale test:** chạy workload representative nhiều owner/occupancy, list lịch sử dài, đọc/ghi hỗn hợp và job chạy; kiểm tra p50/p95/p99/5xx/429/DB pool/pending age. QA 50/100 worker hiện tại không thay thế bước này.
- **Chi phí và quyền quyết định:** gắn một người duyệt ngân sách hạ tầng trước autoscaling; không đặt định mức chi phí hoặc capacity cho tới khi có workload/giá của môi trường mục tiêu.

### Thứ tự mở rộng sau khi đủ điều kiện

1. Hoàn tất telemetry, migration/backup/restore, shared keys, limiter phân tán và job coordinator.
2. Đo staging với image production và dữ liệu synthetic; tăng traffic canary nhỏ, một app replica mỗi lần. Kiểm tra login/cookie, worker counts, database pool và invoice/payment invariants sau từng bước.
3. Chỉ tăng thêm app replicas khi CPU/request queue là nút thắt và PostgreSQL còn headroom. Nếu DB là nút thắt, tối ưu truy vấn/phân trang/aggregate trước; replica app làm tăng connection và duplicate background work.
4. Định kỳ diễn tập restart/rollback/restore và provider outage. Mỗi lần chỉnh poll, batch hay limit phải có owner, số liệu trước/sau, thời hạn và phương án quay lại.

## Không làm trong mọi trường hợp

- Không xóa/recreate invoice, receipt, `PayOsAttempt` Pending, webhook registration, database volume hoặc DataProtection keys để khôi phục dịch vụ.
- Không đánh dấu Paid từ browser return, ảnh, lời xác nhận, QR, provider status chưa có amount/reference kiểm chứng hoặc fixture.
- Không gửi webhook giả/fixture/load test tới origin thật, không tạo payment thật để kiểm tải.
- Không rollback bằng `docker compose down -v`, xóa cột schema, hoặc restore bản cũ lên DB đang nhận writes khi chưa có đối soát delta.
- Không tắt webhook để giảm tải; nếu phải giới hạn, giữ endpoint callback, manual reconciliation và audit trail.

## Hồ sơ đóng sự cố

Lưu: timeline; image digest/config revision; metric 5 phút trước-trong-sau; top route đã ẩn dữ liệu; trạng thái DB/job/provider; số pending và tuổi backlog; kết quả đối chiếu order/receipt/invoice; backup id và restore rehearsal; quyết định rollback; nguyên nhân; action/owner/deadline. Chỉ lưu aggregate và mã tham chiếu đã được phép; không đính kèm token khách, credential, QR có thể trả tiền hoặc bản dump DB vào ticket.
