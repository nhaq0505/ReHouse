# Kế hoạch và bàn giao dự án Quản Lý Phòng

Cập nhật: **13/10/2026 — Asia/Ho_Chi_Minh**.

Đây là tài liệu đọc đầu tiên khi agent mới tiếp tục dự án. Tài liệu ghi lại yêu cầu đã chốt, kế hoạch, trạng thái thực tế và cách tiếp tục; mã nguồn và kết quả kiểm tra mới hơn là căn cứ khi có khác biệt. Sau mỗi đợt làm việc, cập nhật tài liệu này để tránh mất ngữ cảnh.

## 1. Trạng thái hiện tại

**Đã hoàn thành MVP, đợt sửa FE và trang thử nghiệm evondevKit tại /rooms. Skill đã cài cục bộ cho dự án. Webhook payOS đã tự đăng ký/xác minh qua giao diện (mục 14); đã quan sát một giao dịch payOS 30.000 VND ở trạng thái Paid trong dữ liệu local, chưa kiểm thử đủ các tình huống vận hành. Chưa triển khai toàn bộ app lên máy chủ công khai. Camera/AI chưa làm.**

**Quick status 13/10:** API cục bộ đã chuyển từ SQLite sang PostgreSQL 17 bằng snapshot nhất quán và importer riêng; đối chiếu toàn bộ 13 bảng/404 dòng, tiền, kiểu dữ liệu, quan hệ/unique và khóa DataProtection đều khớp. API Development đang ở `localhost:5080`, PostgreSQL chỉ bind `127.0.0.1:15432`; đây là chuyển đổi cục bộ trên một máy, chưa phải triển khai công khai hay HA. Xem mục 25 và [hướng dẫn SQLite → PostgreSQL](sqlite-to-postgres-migration.md). Quy trình schema migrations đầy đủ, restore drill định kỳ, phối hợp nhiều instance, telemetry production và autoscaling vẫn chưa sẵn sàng.

Yêu cầu gần nhất: triển khai **Trả phòng & quyết toán**. Đã gom luồng chốt điện cuối kỳ, công nợ, cọc/hoàn cọc và kết thúc lượt thuê trong một drawer; xem mục 18. Các mục 15–17 là lịch sử các tính năng cọc, nhân bản phòng và hóa đơn bổ sung đã hoàn tất.

- Workspace: `/Users/nguyenhoanhquan/Documents/Project Cá Nhân/Quản Lý Phòng`.
- Frontend demo: `http://localhost:5173/dashboard`.
- Backend Development: `http://localhost:5080`.
- Frontend gọi `/api` qua proxy Vite tới backend.
- Database ứng dụng hiện tại: PostgreSQL trong container `rehouse-pg-migration-db`, database `room_rental`, chỉ bind `127.0.0.1:15432`.
- SQLite nguồn được giữ nguyên; snapshot đóng băng trước cutover nằm trong `backend/RoomRental.Api/.local-data/sqlite-to-postgres/room-rental-final-frozen-20261013.db`. Không đổi lại SQLite chỉ bằng cách sửa provider/connection string; xem mục 25 về delta sau cutover.
- Dữ liệu được lưu thật trong database, không phải giao diện giả lập.
- Tại lần bàn giao, thư mục **chưa là Git repository**, chưa có commit hoặc PR.
- Đã khôi phục tài khoản chủ trọ mẫu và để tab demo ở trang tổng quan sau kiểm tra FE. Các tiến trình dev có thể dừng khi phiên làm việc kết thúc; kiểm tra trước khi khởi động thêm để tránh trùng cổng.

## 2. Bối cảnh và các quyết định đã chốt

Người dùng muốn xây website quản lý phòng trọ bằng .NET, với frontend phù hợp.

1. Một chủ trọ quản lý nhiều dãy trọ; mỗi dãy có nhiều phòng.
2. Chủ trọ phải được **admin duyệt** mới được sử dụng nghiệp vụ. Đăng ký tạo tài khoản chờ duyệt; admin có thể duyệt, từ chối, tạm khóa và mở khóa.
3. Người thuê vào link riêng để xem hóa đơn và thanh toán, không cần tài khoản đăng nhập.
4. Link thuộc **lượt thuê**, không phải quyền truy cập vĩnh viễn cho một phòng. Khi người thuê chuyển đi, link bị thu hồi; người thuê mới không nhìn thấy nợ của người cũ.
5. Tích hợp payOS theo cấu hình riêng từng chủ trọ, tiền về kênh của chủ trọ tương ứng.
6. Chỉ xác nhận thanh toán và gạch nợ từ webhook hợp lệ hoặc đối soát phía máy chủ. URL quay về từ trang thanh toán không chứng minh đã trả tiền.
7. Người dùng ban đầu muốn chụp công tơ và dùng AI qua API để nhận diện. Sau đó đã **chuyển camera/AI sang giai đoạn sau**, trước mắt chủ trọ nhập chỉ số điện thủ công. Không đưa AI trở lại phạm vi MVP nếu chưa có yêu cầu tiếp tục.
8. Công thức điện: `(chỉ số mới − chỉ số trước) × đơn giá/kWh`. Không lấy toàn bộ chỉ số tích lũy nhân đơn giá.
9. Chốt chỉ số hợp lệ sẽ lập hóa đơn ngay, gồm tiền phòng, điện, nước và dịch vụ; mức phí và chỉ số được lưu tại thời điểm phát hành.
10. Frontend đã chọn: React + TypeScript + Vite + Ant Design, giao diện tiếng Việt, thương hiệu **Rehouse** (chốt ngày 13/10/2026; trước đây là “nhà mình”).

Người dùng đã yêu cầu triển khai bằng agent Luna reasoning max. Đợt MVP dùng ba sub-agent `gpt-6-luna`, `max`: backend, frontend, verification; agent chính tích hợp và kiểm tra. Các sub-agent đã kết thúc, không có công việc chờ từ chúng. Không giả định agent mới có thể dùng lại các phiên/sub-agent cũ.

## 3. Kế hoạch và tiến độ

| Bước | Nội dung | Trạng thái / kết quả |
| --- | --- | --- |
| 1 | Chốt nghiệp vụ, phân quyền, stack, API | Hoàn thành; có hợp đồng API |
| 2 | Xây backend .NET và database | Hoàn thành MVP; SQLite dev, PostgreSQL Docker |
| 3 | Đăng ký, đăng nhập, admin duyệt chủ trọ | Hoàn thành; chủ trọ chưa duyệt không được thao tác nghiệp vụ |
| 4 | Quản lý dãy, phòng, lượt thuê và link khách | Hoàn thành |
| 5 | Nhập điện, tính phí, phát hành hóa đơn | Hoàn thành; chốt thủ công, không sửa lại chỉ số đã phát hành qua UI |
| 6 | Thu tiền thủ công, trả một phần, tính số dư | Hoàn thành; chống ghi nhận lặp khi retry |
| 7 | payOS checkout, webhook và đối soát | Mã tích hợp hoàn thành; cần khóa thật và webhook công khai để kiểm chứng thực tế |
| 8 | Frontend chủ trọ, admin, portal khách | Hoàn thành MVP |
| 9 | Docker, bảo mật, kiểm tra SQLite/PostgreSQL | Hoàn thành kiểm tra cục bộ; chưa triển khai công khai |
| 10 | Rà soát và sửa FE theo phản hồi | Hoàn thành; bổ sung pilot evondevKit /rooms, xem mục 12 |
| 11 | UAT trên dữ liệu sử dụng thực, payOS thật | Chưa thực hiện |
| 12 | Migration, triển khai, sao lưu và khôi phục vận hành | Chưa hoàn thành; hiện schema dùng EnsureCreated |
| 13 | Camera và AI nhận diện qua API | Hoãn theo yêu cầu người dùng; chưa triển khai |

## 4. Những gì đang dùng được

### Chủ trọ

- Tổng quan số phòng, phòng đang thuê, tiền hóa đơn, đã thu, còn nợ và số phòng cần chốt điện.
- Tạo dãy trọ với tên và địa chỉ.
- Tạo phòng, thiết lập giá thuê, đơn giá điện, phí nước cố định/theo người, phí dịch vụ, chỉ số điện ban đầu; sửa thông tin và phí phòng.
- Thêm người thuê với tên, điện thoại, số người, ngày vào; ghi nhận chuyển đi.
- Mở link khách đang dùng, sao chép hoặc mở portal khách; thu hồi và tạo link mới qua xác nhận riêng.
- Nhập chỉ số điện theo tháng; ngăn chỉ số giảm, kỳ tương lai, bản ghi trùng và các trường hợp không hợp lệ theo lượt thuê/thứ tự kỳ.
- Chốt điện và lập hóa đơn; kiểm tra/tạo hóa đơn còn thiếu không tạo trùng.
- Xem chi tiết hóa đơn và các thành phần tiền; ghi nhận thu tiền mặt/chuyển khoản ngoài, thu một phần hoặc toàn bộ.
- Lưu cấu hình payOS đã mã hóa, xem URL webhook, đối soát giao dịch theo hóa đơn.

### Admin và người thuê

- Admin xem/lọc danh sách chủ trọ, duyệt/từ chối/tạm khóa/mở khóa.
- Người thuê mở link riêng, xem số dư và chi tiết hóa đơn, bắt đầu thanh toán payOS hoặc kiểm tra giao dịch.
- Thiếu cấu hình payOS sẽ không có thanh toán thành công giả. Đã tích hợp nút thanh toán nhưng cần kiểm thử kết nối thật trước khi thu tiền.

### Các đặc tính backend cần giữ khi chỉnh sửa

- Tách dữ liệu theo chủ trọ; kiểm tra vai trò và trạng thái tài khoản trên máy chủ.
- Cookie HttpOnly, kiểm tra Origin/Referer cho yêu cầu thay đổi dữ liệu, giới hạn tần suất ở các luồng cần thiết.
- Link khách ngẫu nhiên, token băm và bản mã phục vụ cấp lại; không ghi token vào log hoặc tài liệu bàn giao.
- Khóa payOS được mã hóa bằng DataProtection. Phải giữ khóa DataProtection khi giữ database.
- Hóa đơn lưu mức phí đã chốt; sửa giá phòng không sửa hóa đơn cũ.
- Ghi nhận tiền có idempotency; webhook lặp chỉ tạo một khoản thu; xác minh chữ ký, chủ nhận, order và số tiền.
- Khi tạo checkout gặp kết quả không chắc chắn, giữ giao dịch để đối soát, không tạo thêm checkout có thể dẫn tới thu trùng.
- Không đổi khóa payOS, ghi nhận thu ngoài hoặc chuyển người thuê đi khi còn giao dịch pending chưa được xử lý, theo quy tắc hiện tại.

## 5. Phản hồi FE gần nhất và phần đã sửa

Người dùng không thấy nút tạo dãy, tạo phòng và cấp link; sau đó yêu cầu kiểm tra toàn bộ thiết kế FE.

**Nguyên nhân đã xác nhận:** Menu Ant Design dùng màu chữ tối trên sidebar tối, làm các mục gần như biến mất. Ở khung trình duyệt hẹp, điều hướng bị thu vào biểu tượng nhỏ; bảng rộng và thao tác giấu trong menu dấu ba chấm làm chức năng khó tìm.

Đã sửa:

- Menu máy tính/drawer dùng theme dark và màu chữ rõ; drawer có nút đóng.
- Hiện điều hướng trực tiếp trong khung hẹp, có tên từng mục và nhãn Menu.
- Dashboard có ba lối tắt: **Tạo dãy trọ / Tạo phòng trọ / Cấp link cho khách**. Hai lối tắt tạo mở đúng form.
- Nút cấp link hiện trực tiếp trên từng phòng đang thuê; phòng trống hiện Thêm người thuê.
- Mở/sao chép link không tự thu hồi link cũ. Thu hồi và tạo mới là thao tác riêng có xác nhận.
- `ResponsiveTable` dùng ResizeObserver đo vùng nội dung thực tế. Khi không đủ rộng để hiển thị bảng, chuyển sang thẻ giữ đầy đủ dữ liệu, form, hành động và phân trang. Áp dụng cho phòng, điện, hóa đơn, tài khoản chủ trọ.
- Tăng cỡ chữ và độ tương phản, thêm viền focus bàn phím; dashboard dùng hai cột thống kê trên điện thoại.
- Sửa CSS nhãn mô tả ghi đè màu chữ/icon trong nút Thanh toán của portal khách.
- Form dài cuộn phần thân riêng trên điện thoại, vẫn hiện nút lưu/hủy; giới hạn drawer theo viewport.
- Sửa breakpoint đăng nhập/đăng ký, tên/email dài, nhãn bộ lọc/tháng và vị trí cuộn khi đổi trang.

Không coi đợt sửa này là xác nhận mọi tình huống FE đã hoàn hảo. Trang trạng thái tài khoản và lỗi đã rà qua mã, chưa kiểm tra trực quan với tài khoản chờ duyệt trong đợt FE này.

## 6. Bản đồ mã nguồn và tài liệu

| Vị trí | Nội dung |
| --- | --- |
| `backend/RoomRental.Api/Program.cs` | Khởi động, provider database, auth, proxy, middleware, jobs |
| `backend/RoomRental.Api/Domain/` | Entities và DTO |
| `backend/RoomRental.Api/Data/` | DbContext, khởi tạo schema và demo |
| `backend/RoomRental.Api/Endpoints/` | Auth, admin, dãy/phòng/lượt thuê, hóa đơn, thanh toán |
| `backend/RoomRental.Api/Services/` | Tính hóa đơn, token khách, payOS, chữ ký, bảo mật request |
| `frontend/src/App.tsx`, `auth.tsx`, `api.ts` | Routes, gate tài khoản, auth state, hợp đồng gọi API |
| `frontend/src/components/AppShell.tsx` | Sidebar, menu compact/drawer, khung trang |
| `frontend/src/components/ResponsiveTable.tsx` | Bảng/thẻ theo chiều rộng thực của vùng nội dung |
| `frontend/src/styles.css` | Thiết kế và responsive; lưu ý các quy tắc tương phản nút/menu cuối file |
| `frontend/src/pages/` | Toàn bộ trang chủ trọ, admin, auth và portal khách |
| `tests/` | Kiểm thử HTTP nghiệp vụ và fixture webhook SQLite |
| `Dockerfile`, `compose.yaml`, `.env.example` | Build frontend/backend, PostgreSQL và cấu hình vận hành |

Tài liệu chi tiết: [README](../README.md), [API contract](api-contract.md), [phạm vi/giới hạn](implementation-notes.md), [kiểm tra MVP](verification.md), [rà soát FE](frontend-review.md), [hướng dẫn tests](../tests/README.md).

Ảnh kiểm tra trong `artifacts/`, gồm `frontend-review-desktop.png` và `frontend-review-current.png`. Ảnh là minh chứng tại thời điểm chụp, không phải dữ liệu chuẩn để viết test.

## 7. Cách chạy và kiểm tra

Chạy từ thư mục gốc dự án. Yêu cầu .NET SDK 10 và Node.js tương thích; lần triển khai dùng Node 24.

Backend:

```sh
ASPNETCORE_ENVIRONMENT=Development SeedDemo=true dotnet run --project backend/RoomRental.Api --urls http://localhost:5080
```

Frontend ở terminal khác:

```sh
cd frontend
npm ci
npm run dev
```

Tài khoản **demo Development**, chỉ dùng khi bật seed:

| Vai trò | Email | Mật khẩu mẫu |
| --- | --- | --- |
| Chủ trọ | owner@phongtro.local | Owner123! |
| Admin | admin@phongtro.local | Admin123! |

Không dùng các tài khoản/mật khẩu mẫu làm cấu hình production. Không lưu khóa payOS thật hoặc link khách thật vào tài liệu này.

Kiểm tra build:

```sh
dotnet build backend/RoomRental.Api
npm --prefix frontend run build
```

Kiểm thử tích hợp, **chỉ với database Development dùng thử** và backend đang chạy:

```sh
python3 -m unittest discover -s tests -v
```

Fixture webhook chỉ chạy khi chỉ định `TEST_SQLITE_DB` đến đúng SQLite của API localhost; xem `tests/README.md`. Test tạo dữ liệu chủ trọ/dãy/phòng/khoản thu ngẫu nhiên, không chạy vào database vận hành. Dữ liệu demo hiện có cả dữ liệu từ các lần test trước, không tự dọn bằng cách xóa database.

Docker: sao chép `.env.example` thành `.env`, thay mật khẩu/URL phù hợp rồi `docker compose up --build -d`. Production dùng PostgreSQL và frontend cùng origin, không bật demo. Phải cấu hình HTTPS và IP reverse proxy thực trong `TRUSTED_PROXIES` khi truy cập qua tên miền/LAN. Không tin mọi proxy.

### Kết quả kiểm tra đã có

- MVP: backend build 0 lỗi/0 cảnh báo; frontend build thành công.
- SQLite: 12/12 test gồm fixture webhook; PostgreSQL 17: 11/11 test nghiệp vụ, fixture SQLite không áp dụng.
- Docker Production: build, khởi động, admin bootstrap đăng nhập; giữ dữ liệu/phiên khi dựng lại với cùng volume.
- Audit NuGet và npm ở đợt MVP không phát hiện lỗ hổng theo nguồn kiểm tra lúc đó.
- Đợt sửa FE mới nhất: TypeScript và production build thành công; vẫn có cảnh báo kích thước chunk Ant Design dùng chung.
- Đã kiểm tra trực quan các màn hình chủ trọ, admin, auth và portal khách; thử các chiều rộng 320, 390, 447, 768, 992, 1280px, form tạo dãy/phòng, chi tiết hóa đơn, link khách hiện có, drawer và phân trang thẻ.
- Không có thanh toán ngân hàng thật trong các lần kiểm tra. Không suy ra kết quả giao dịch thật từ fixture/webhook dùng khóa giả.
- Docker QA trước đó đã dừng và dọn riêng các tài nguyên QA. Các sửa FE mới nhất đã kiểm tra bằng Vite và production build; **chưa dựng lại image Docker sau đợt sửa FE**.

## 8. Việc còn lại và thứ tự đề xuất

Đây là kế hoạch tiếp tục, không phải các việc đã hoàn thành hay một yêu cầu mới được người dùng giao.

1. **UAT MVP cùng người dùng:** chủ trọ mới đăng ký/chờ duyệt, tạo dãy/phòng, thêm khách, chốt điện, kiểm tra hóa đơn, thu một phần, mở link khách và kết thúc lượt thuê. Bổ sung kiểm tra trực quan trạng thái chờ duyệt, thông báo lỗi và dữ liệu dài/nhiều phòng.
2. **Kiểm chứng payOS thật:** cần bộ khóa chủ trọ và URL HTTPS webhook công khai. Thử checkout, webhook lặp, sai số tiền, mất webhook/đối soát và giao dịch hủy/hết hạn. Không nhập khóa hoặc giả định đã triển khai nếu chưa được cung cấp.
3. **Chuẩn bị vận hành công khai:** bổ sung EF/versioned migrations và thử nâng cấp/khôi phục định kỳ; triển khai ingress/HTTPS và proxy trust; admin riêng; giám sát lỗi/job. PostgreSQL hiện tại chỉ là container cục bộ một máy, không phải cấu hình Internet/HA.
4. **Tối ưu FE tiếp theo nếu cần:** giảm bundle thư viện dùng chung, bổ sung kiểm thử UI cho luồng có rủi ro thực tế. Không thay stack hoặc viết lại giao diện chỉ để tối ưu cảnh báo build.
5. **Camera/AI khi người dùng yêu cầu:** tạo luồng chụp công tơ, backend gọi API AI (Gemini là hướng đã ghi trong ghi chú), trả chỉ số đề xuất; kiểm tra độ rõ/ngưỡng/chỉ số trước; người dùng xác nhận hoặc chủ trọ xử lý trường hợp bất thường. Chọn/xác minh model và hợp đồng API tại thời điểm triển khai. AI không được tự xác nhận thanh toán; thuật toán tính tiền vẫn nằm ở backend.
6. **Nghiệp vụ mở rộng theo yêu cầu riêng:** quyết toán giữa tháng, chia kỳ theo lượt thuê, điều chỉnh hóa đơn đã phát hành, tiền cọc/hợp đồng, chỉ số nước, công tơ chung, hoàn tiền, hạn thanh toán tùy chỉnh.

## 9. Giới hạn cần nhớ

- Mỗi phòng có một chỉ số điện/một tháng; chưa hỗ trợ hai lượt thuê thay nhau cùng tháng hoặc tự chia tiền theo số ngày.
- Hạn thanh toán mặc định: ngày 5 tháng sau; chưa có UI cấu hình riêng.
- Chưa có chỉnh sửa/điều chỉnh hóa đơn đã chốt, tiền cọc, hợp đồng điện tử, hóa đơn thuế, hoàn tiền tự động, chỉ số nước hoặc chia công tơ.
- Schema dùng `EnsureCreated`, chưa có quy trình migration vận hành hoàn chỉnh.
- Mất khóa DataProtection có thể làm mất khả năng giải mã cấu hình payOS/link khách dù database vẫn còn.
- Không xóa database hoặc chạy `docker compose down -v` để giải quyết lỗi nâng cấp nếu cần giữ dữ liệu.
- Hướng dẫn và bằng chứng chuyển đổi SQLite → PostgreSQL cục bộ ngày 13/10/2026 nằm ở mục 25 và [sqlite-to-postgres-migration.md](sqlite-to-postgres-migration.md). Đó là import một lần đã đối chiếu, chưa thay thế schema migrations hoặc restore drill vận hành.
- Trên macOS, thư mục `Data` chứa mã nguồn và `data` có thể trùng nhau do filesystem không phân biệt hoa/thường. Dữ liệu SQLite đã tách sang `.local-data`; giữ cách tách này.

## 10. Hướng dẫn agent tiếp theo

1. Đọc tài liệu này, yêu cầu mới nhất của người dùng và mã liên quan trước khi làm; không làm lại những bước đã hoàn thành.
2. Kiểm tra tiến trình/cổng và database đang dùng; giữ nguyên dữ liệu, khóa mã hóa và cấu hình người dùng.
3. Giữ phạm vi nhập điện thủ công cho đến khi được yêu cầu triển khai camera/AI.
4. Nếu sửa UI, xem giao diện thực trong khung trình duyệt hẹp của người dùng, không chỉ dựa vào build hoặc screenshot desktop. Kiểm tra menu và màu chữ trong nút; dùng độ rộng vùng nội dung khi quyết định bảng/thẻ.
5. Nếu sửa thanh toán/phân quyền/tính tiền, chạy kiểm tra phù hợp và giữ các điều kiện xác minh phía máy chủ; không báo “đã thanh toán” từ redirect hoặc từ trạng thái UI.
6. Sau khi làm xong, cập nhật mục 1, 3, 7, 8 và ghi rõ kiểm tra nào đã chạy, giới hạn nào còn tồn tại. Không biến kế hoạch dự kiến thành kết quả đã đạt.


## 11. Nghiên cứu evondevKit — 12/10/2026

Nguồn: https://github.com/evondev/evondevKit . Snapshot mã đã đọc: `d2ac1a1fbfea4cf339e6f392030c3697aa203185`; plugin metadata ở snapshot ghi phiên bản `0.3.24`. Không dùng thư mục `archive/` làm hướng dẫn hiện hành.

### Kết luận

**Có thể áp dụng cho việc chuẩn hóa và rà soát FE; phù hợp với các màn dashboard, danh sách, bảng, form, settings và modal của dự án.** Đây là skill/hướng dẫn cho AI agent kèm mẫu và script đo UI, không phải một ứng dụng quản lý trọ hoàn chỉnh hoặc một thư viện component cần thay Ant Design.

- Skill có quy tắc phát hiện stack, dùng lại component thư viện hiện có (bao gồm Ant), giữ token/màu của dự án, dùng được với CSS thuần.
- README có hướng dẫn dùng với Codex qua skill `ui-ux`; tác giả ghi được thử nghiệm nhiều nhất trên Claude và vẫn ở beta. Chưa kiểm chứng thực thi skill trong phiên Codex của dự án này.
- Có design system gồm bảy nhóm cơ bản: button, badge, input, card, list row, modal và empty state; có nhánh review UI hiện có, giữ brand, refactor giữ hình và dựng luôn không wireframe.
- Script `probe.mjs` dùng Playwright, đo và chụp nhiều chiều rộng; có sweep tìm lỗi giữa các breakpoint, phép đo tương phản/chữ/tràn và kiểm tra lớp nổi.
- License MIT; nếu sao chép/phân phối nội dung đáng kể của kit, giữ thông báo bản quyền và giấy phép.

### Cách áp dụng đề xuất cho dự án

1. Dùng skill trong phạm vi project nếu người dùng yêu cầu cài/áp dụng; không tự cài toàn máy. Có thể ghim snapshot để dễ đối chiếu thay đổi.
2. Chốt hệ thiết kế chung bằng ConfigProvider Ant Design, CSS variables hiện có và các component chia sẻ. Giữ brand “nhà mình”, tiếng Việt và các mức phí/tiền theo hợp đồng API.
3. Thử trước một route `/rooms`: hành động tạo phòng, thêm khách và cấp link phải rõ; trạng thái trống/loading/error và form nhỏ phải sử dụng được.
4. Khi đạt yêu cầu, áp dụng cùng quy tắc cho `/buildings`, `/readings`, `/invoices`, dashboard, cấu hình thanh toán và portal khách.
5. Kiểm tra giao diện và hành vi thật sau mỗi thay đổi, không chỉ chấm điểm hình ảnh. Giữ API, auth gate, query cache, idempotency và xác minh thanh toán đang hoạt động.

### Điểm cần điều chỉnh khi tích hợp

- Skill chỉ xử lý giao diện; tài liệu cho phép để handler/logic thành placeholder. Với app hiện có, phải giữ/nối đầy đủ handler thật, không thay luồng đang hoạt động bằng ví dụ tĩnh.
- Mặc định có bước duyệt brief/chọn wireframe; nếu người dùng muốn làm ngay thì dùng nhánh “dựng luôn, không wireframe”, theo phạm vi đã được giao.
- Probe mở Chromium riêng và có hành vi tự bấm menu/nút tạo form. Mã có bộ lọc loại nút thao tác nguy hiểm nhưng không coi đây là đảm bảo tuyệt đối. Riêng nút “Tạo hóa đơn còn thiếu” của app gọi API trực tiếp, không chỉ mở form; phải loại khỏi lượt tự bấm hoặc dùng dữ liệu Development dùng thử.
- Bộ probe hiện không thấy tùy chọn CLI nạp phiên đăng nhập của app. Route chủ trọ/admin cần phiên xác thực trước khi đo; nếu không có sẽ kiểm tra nhầm trang login. Link portal khách là bí mật, không đưa vào báo cáo công khai.
- Trong phiên Codex này, browser UI phải dùng công cụ browser được cung cấp. Muốn áp dụng phép đo của probe thì thực hiện tương đương qua công cụ đó; không tự chạy Playwright bên ngoài để điều khiển browser trong phiên này.
- Các quy tắc về gu như flat, bóng, icon, padding là đề xuất thiết kế; không tự động kết luận chúng là lỗi nghiệp vụ hoặc lỗi khả dụng.

**Trạng thái tại thời điểm nghiên cứu:** chưa cài/chưa áp dụng. Sau khi người dùng yêu cầu thực hiện, đã cài bằng skill-installer vào project và triển khai pilot; thông tin hiện tại nằm ở mục 12. Không chạy npx skills add và không chạy probe.mjs.

Nguồn chi tiết: `README.md`, `skills/ui-ux/SKILL.md`, `references/review.md`, `references/responsive.md`, `references/system.md`, `scripts/probe.mjs`, `LICENSE` trong repo nguồn.


## 12. Áp dụng evondevKit: pilot Phòng & người thuê — hoàn thành 12/10/2026

### Cài đặt

- Dùng helper của skill-installer, cài `skills/ui-ux` từ repo evondev/evondevKit vào **`.agents/skills/ui-ux`** của project, không cài global.
- Ghim commit `d2ac1a1fbfea4cf339e6f392030c3697aa203185`. Có `SOURCE.json` ghi nguồn/commit và `LICENSE` MIT đi kèm.
- Skill có thể được phát hiện ở lượt sau; agent đã đọc SKILL.md để áp dụng ngay trong lượt này.
- Đi theo hướng dựng trực tiếp cho route đã được người dùng đồng ý, giữ brand và các handler hiện có; không dựng wireframe hoặc thêm route design-system.

### Những gì đã đổi

- **/rooms**: tiêu đề Phòng & người thuê, nút Tạo phòng trọ duy nhất làm hành động chính; bộ lọc có nhãn ngay trên danh sách, số đếm theo dãy đang lọc; bỏ banner hướng dẫn và strip thống kê lặp.
- Desktop: bảng gọn với tên phòng/dãy, người thuê, tiền/tháng, trạng thái và thao tác. Nút cấp link hoặc thêm người thuê luôn hiện; thao tác phụ trong nút ba chấm có aria-label.
- Khung hẹp: dòng phòng có tên/trạng thái ở đầu, người thuê/điện thoại, giá thuê và hành động cuối. Cùng một khung danh sách, không lồng nhiều card viền bên trong.
- Có Xóa lọc khi không tìm được phòng; query dãy cũ hiện “Dãy không còn tồn tại”. Bộ lọc dãy đọc từ URL để đồng bộ khi điều hướng; tạo phòng chỉ điền sẵn dãy hợp lệ.
- Form và modal giữ các field/validation/API hiện có, font nhập 16px trên điện thoại, thân cuộn riêng, nút lưu/hủy vẫn hiện; form không đóng khi bấm mask.
- Link hiện có mở/sao chép được; thu hồi là thao tác nguy hiểm riêng có xác nhận, mặc định focus Hủy. Không thu hồi link trong lần kiểm tra.
- Giữ màu xanh Nhà Mình, DM Sans cho workflow này; dùng accent tối hơn cùng họ màu để chữ trắng đọc rõ. Không thêm dark mode.
- Thêm **Ant Design App provider** ở main để App.useApp có API message/modal hoạt động, và context theo theme ở trang phòng. Đây là sửa tích hợp cần thiết để toast sau lưu/copy và các hộp xác nhận chạy được.
- ResponsiveTable có slot renderCompact tùy chọn cho trang phòng; các trang khác vẫn dùng cách render cũ.

### Hợp đồng thiết kế và vị trí sửa

- `frontend/src/design/roomTheme.ts`: token Ant Design cho pilot; nút/ô nhập 40px desktop và 44px mobile, radius 12px, một font, một accent xanh.
- `frontend/src/pages/RoomsPage.css`: bố cục, viền/padding, màu phụ/badge, khung thẻ, modal và thanh cuộn 4px trong workflow. CSS có scope để không đổi phong cách các trang khác.
- `frontend/src/pages/RoomsPage.tsx`: render trang/table/thẻ/forms và giữ các mutation thực.
- `frontend/src/components/ResponsiveTable.tsx`: slot renderCompact, giữ logic đo vùng nội dung và phân trang.
- `frontend/src/main.tsx`: provider App của Ant Design ở gốc.
- Giữ focus bàn phím rõ theo quy ước đã có của dự án; không áp quy tắc giấu focus của kit. Chưa đổi font toàn app hoặc sidebar của Nhà Mình.

### Kiểm tra đã chạy

- `npm run build --prefix frontend`: TypeScript và production build thành công. Vite vẫn cảnh báo chunk thư viện dùng chung; Ant App provider được dùng thật nên code message/modal nằm trong bundle chung.
- Giao diện thực ở 320, 375, 768, 1024, 1280, 1440, 1920px; quét **55 mức** từ 1440 xuống 375. Phép đo: chiều rộng trang, control vượt viewport, control nhỏ dưới 32px. Không tìm thấy lỗi theo các phép đo này.
- Đo 33 vùng chữ hiện của trang phòng ở 375px bằng màu foreground/background trong DOM: không thấy tỉ lệ dưới 4.5:1. Phép đo này không thay thế kiểm tra đầy đủ opacity, overlay và mọi trạng thái.
- Kiểm tra lọc Còn trống / Xóa lọc, trạng thái rỗng từ query dãy không tồn tại, menu sửa phòng, form tạo/nhận khách, lỗi bỏ trống tên phòng, sao chép link và mở xác nhận thu hồi rồi hủy.
- Lưu lại phòng P101 với **đúng các giá trị đang có**, backend nhận thành công và hiện toast. Không tạo thêm phòng, không đổi mức phí hoặc người thuê, không thu tiền hoặc phát hành hóa đơn trong phiên này.
- Xem lại trang điện và hóa đơn ở màn hẹp để xác nhận renderer mặc định của ResponsiveTable vẫn hoạt động.
- Đã đặt lại kích thước viewport, đóng modal/bộ lọc thử và để tab demo ở **http://localhost:5173/rooms**.

### Minh chứng và giới hạn

- Ảnh: `artifacts/evon-rooms-before.png`, `artifacts/evon-rooms-desktop.png`, `artifacts/evon-rooms-current.png`.
- Đo DOM: `artifacts/evon-rooms-measurements.json`.
- **Không chạy script probe.mjs gốc**: các thao tác browser của phiên này phải qua công cụ browser Codex. Đã làm phép đo/sweep và kiểm tra thủ công bằng công cụ đó; không tuyên bố đã chạy toàn bộ checker upstream hoặc danh sách mã P của kit.
- Không có phiên kiểm tra mới backend/PostgreSQL/Docker trong đợt thay FE này. Các kết quả MVP trước vẫn là lịch sử, chưa chứng minh image Docker đã chứa FE mới.
- Chưa kiểm tra đầy đủ người thuê/tên phòng rất dài, danh sách nhiều trang, lỗi mạng khi lưu, workspace mới chưa có dãy. Các component xử lý đã có trong mã nhưng cần bổ sung UAT nếu tiếp tục.
- Pilot hoàn tất; bước kế tiếp là lấy phản hồi trang phòng rồi áp dụng cùng hệ vào dãy, hóa đơn, điện, dashboard, settings và portal khách theo yêu cầu mới. Tiếp tục giữ phạm vi AI hoãn và payOS thật chưa xác minh.


## 13. Webhook payOS local đã đăng ký — 12/10/2026

- Người dùng đã lưu khóa kênh payOS và yêu cầu dựng tunnel để test.
- Đã cài cloudflared 2026.9.3 qua Homebrew. Gateway `scripts/payos_webhook_gateway.py` nghe tại `127.0.0.1:5081`, chỉ chuyển POST JSON tối đa 64 KiB cho đúng chủ trọ về API local port 5080. Không chuyển cookie, header xác thực hay Origin của người gọi. Các endpoint quản trị và owner khác không được chuyển.
- Tunnel hiện tại: `https://lane-warned-pork-soldiers.trycloudflare.com`.
- Webhook đã đăng ký: `https://lane-warned-pork-soldiers.trycloudflare.com/api/payments/webhook/3b50eed2-9eae-4833-b508-9eca4c4d4200`.
- Đã gọi API chính thức `POST https://api-merchant.payos.vn/confirm-webhook` bằng cấu hình chủ trọ đã lưu, giải mã trong bộ nhớ; không in hoặc ghi khóa plaintext. payOS trả HTTP 200, code `00`, desc `success`. Đây là xác nhận webhook, không phải giao dịch trả tiền thật.
- Kiểm tra qua HTTPS: GET `/api/auth/me` trả 404; POST webhook owner khác trả 404; POST webhook đúng owner thiếu chữ ký trả 401. Gateway local cũng đã kiểm tra cùng các trường hợp và GET callback trả 404.
- Sau xác minh, hai hóa đơn hiện có vẫn tổng 8.260.000 VND, Paid=0, ProcessedWebhooks=0 cho chủ trọ này. Giao dịch mẫu không tạo khoản thu.
- FE hỗ trợ biến `VITE_WEBHOOK_BASE_URL` để hiển thị/copy đúng origin webhook khi UI vẫn dùng localhost. Giá trị phiên này trong `frontend/.env.local` (gitignore). `frontend/.env.example` có hướng dẫn. npm run build --prefix frontend đã pass; cảnh báo kích thước bundle cũ còn tồn tại.
- Các tiến trình đang chạy trong phiên: gateway exec session 92271; cloudflared session 49064. Không cài dịch vụ khởi động cùng máy. Dừng tiến trình hoặc tắt máy sẽ mất webhook; URL Quick Tunnel đổi khi chạy lại. Không dùng URL này cho production.
- Khởi động lại gateway: `/usr/bin/python3 scripts/payos_webhook_gateway.py --owner-id 3b50eed2-9eae-4833-b508-9eca4c4d4200`.
- Khởi động tunnel: `cloudflared tunnel --url http://127.0.0.1:5081 --no-autoupdate --no-prechecks`. Bước kết nối đã mất khoảng một phút; precheck từng báo timeout nhưng tunnel sau đó kết nối QUIC thành công. Không kết luận mạng bị chặn chỉ từ precheck.
- Khi đổi URL tunnel, cập nhật frontend/.env.local và đăng ký/xác minh lại URL trên payOS. Khi build production, bỏ biến tunnel tạm thời hoặc thay bằng origin API ổn định.
- Bước còn lại: người dùng thanh toán một hóa đơn thử số tiền nhỏ rồi kiểm chứng khoản thu/hóa đơn. Chưa tạo hóa đơn thử mới, chưa tạo checkout, chưa chuyển tiền. Return URL hiện vẫn là localhost:5173; phù hợp test trên chính máy này, chưa phù hợp khách dùng điện thoại khác.


## 14. Tự đăng ký/xác minh webhook khi lưu payOS — 12/10/2026

- Theo yêu cầu người dùng, PUT /api/settings/payment giờ lưu/commit khóa rồi tự POST API chính thức /confirm-webhook. Không giữ transaction DB khi gọi HTTP để webhook mẫu có thể đọc khóa vừa lưu.
- PaymentWebhookService lấy URL từ cấu hình server WebhookBaseUrl, mặc định PublicBaseUrl/APP_PUBLIC_URL. Chỉ chấp nhận HTTPS origin; không lấy Host header, URL từ client hoặc frontend. Production dùng WEBHOOK_BASE_URL qua compose; development dùng appsettings.Development.local.json (gitignore).
- Giá trị local hiện tại vẫn là origin tunnel tại mục 13. FE đã bỏ VITE_WEBHOOK_BASE_URL; URL được trả bởi backend để hiển thị thống nhất.
- Thêm bảng PaymentWebhookRegistrations, keyed OwnerId, lưu URL/status/time/error/version hash. DatabaseInitializer tạo riêng bảng mới nếu chưa có trên SQLite/PostgreSQL; không đổi/xóa các bảng hay dữ liệu tài chính cũ. Đây là nâng cấp cộng thêm cụ thể, chưa thay thế nhu cầu migrations đầy đủ.
- GET settings trả webhookUrl, webhookStatus, webhookVerifiedAt, webhookError. Kết quả cũ không hợp lệ khi phiên bản khóa hoặc URL khác hiện tại. Khóa bí mật vẫn không được trả ra FE.
- POST /api/settings/payment/verify-webhook cho thử lại bằng bộ khóa đã lưu; có owner/approval/origin checks và rate limit. Hỏng mạng, timeout, dữ liệu payOS sai, URL không công khai đều báo chưa xác minh; không mất khóa đã lưu và không báo thành công giả.
- UI nút Lưu và xác minh payOS; spinner trong lúc chờ; cảnh báo/đã xác minh phản ánh DTO; Xác minh lại webhook không cần nhập lại khóa. Bỏ trống API/Checksum key giữ khóa cũ khi đã có cấu hình.
- Kiểm chứng thật: đã bấm Lưu và xác minh payOS trên tài khoản đang đăng nhập, giữ nguyên client/khóa hiện có; payOS xác nhận thành công. Tải lại trang vẫn hiện Verified. Ảnh artifacts/payos-auto-webhook-settings.png. Không chuyển tiền bằng agent.
- Đã chạy 11 assertion service tests với fake HttpMessageHandler + SQLite memory: success, persistence, endpoint/header/body, failure giữ khóa, malformed, timeout, URL mismatch, key/origin stale, HTTP localhost rejection, không tạo receipt. Lệnh dotnet run --project tests/RoomRental.WebhookTests.
- HTTP suite trên API QA riêng port 5082 + DB /tmp/room-rental-webhook-qa.db: 12/12 gồm fixture chữ ký/replay. WebhookBaseUrl QA = http://localhost:5082 để không gửi fake keys tới payOS. Test README đã cập nhật điều kiện này.
- Build backend: 0 warning/error. FE TypeScript/Vite build pass (cảnh báo bundle lớn cũ còn). Docker compose config --quiet pass với biến fixture; không rebuild image hoặc chạy PostgreSQL mới trong đợt này.
- Sau đó đọc dữ liệu local thấy PayOsAttempts Paid 30.000 VND và tổng Paid=30.000 VND; trước đợt này chỉ có 2 hóa đơn chưa trả, giờ có 3 hóa đơn. Agent không tạo thêm hóa đơn/checkout/receipt; đây là thay đổi sử dụng đồng thời bên ngoài thao tác xác minh của agent, không tự nhận đã thực hiện chuyển tiền. Chưa kiểm thử đầy đủ hủy/hết hạn/mất webhook trên giao dịch thật.
- Backend đang chạy phiên mới exec 8358, Development port 5080, DB/khóa cũ được giữ. Gateway 92271 và tunnel 49064 vẫn chạy. Khi đổi URL tunnel, sửa backend appsettings.Development.local.json rồi bấm Xác minh lại webhook; không cần sửa FE nữa.


## 15. Tiền cọc riêng cho từng khách — 12/10/2026

- Người dùng chọn nhập cọc khi nhận khách mới, không mặc định theo giá phòng. Phòng & người thuê → Thêm người thuê → Tiền cọc yêu cầu; 0 là không thu. Số nguyên VND, từ 0 đến 2.147.483.647.
- Start occupancy tạo lượt thuê và hóa đơn Kind=Deposit trong cùng transaction nếu số tiền >0. Đây là khoản phải thu, Paid ban đầu=0. Monthly/Deposit có unique index riêng nên cùng phòng/tháng vẫn tạo được hóa đơn tiền phòng bình thường.
- Link khách hiện tại chứa cả cọc và hóa đơn tháng, dùng checkout/webhook/đối soát payOS hiện có. Chủ trọ có thể ghi nhận tiền mặt/chuyển khoản ngoài hệ thống bằng chức năng thu tiền thủ công. Cọc chưa được kiểm chứng bằng giao dịch tiền thật trong phiên này.
- Trang phòng hiển thị cọc yêu cầu/đang giữ; menu phòng có Thu / quyết toán cọc. Trang Hóa đơn thêm bộ lọc Tiền cọc; loại này lấy mọi kỳ, không dùng nút phát hành hóa đơn tháng.
- InvoiceDto thêm kind, occupancyId, depositHeld và depositSettlements. OccupancyDto thêm depositInvoiceId, depositRequired, depositPaid, depositHeld. Held = Paid - tổng đã hoàn/khấu trừ, không làm giảm Paid lịch sử.
- DepositLedger ghi nhận hoàn cọc hoặc khấu trừ, có lý do và idempotency GUID. Hoàn cọc chỉ là **ghi nhận đã trả tiền bên ngoài**, không tự chuyển tiền ngân hàng. Khấu trừ có thể trừ vào hóa đơn tháng còn nợ cùng lượt thuê; tạo receipt Source=Deposit và cập nhật công nợ trong cùng transaction, không ghi nhận hai lần khi gửi lại.
- POST /api/invoices/{id}/deposit-settlements kiểm tra owner/approval/origin, số tiền không vượt cọc đang giữ, target phải cùng owner/lượt thuê, không vượt nợ và chặn khi có giao dịch online chờ xử lý. Khác payload cùng key trả 409. End occupancy bị chặn nếu còn cọc đang giữ; phải quyết toán hết trước.
- Dashboard tổng tiền tính hóa đơn Monthly, tránh cộng tiền cọc vào doanh thu tháng rồi cộng lại khi khấu trừ. Recent invoice có nhãn cọc riêng.
- DatabaseInitializer nâng cấp cộng thêm Kind mặc định Monthly, DepositSettlements và filtered unique indexes trên SQLite/PostgreSQL. Đã sao lưu DB đang dùng vào backend/RoomRental.Api/.local-data/pre-deposit-upgrade.db trước nâng cấp. SQLite bản cũ và DB thực sau nâng cấp đều giữ 32 hóa đơn, Total=124.665.000, Paid=6.850.000; không tạo dữ liệu QA trong DB thực.
- Build backend 0 warning/error; frontend TypeScript/Vite pass, còn cảnh báo bundle lớn cũ. HTTP suite trên SQLite QA riêng port 5082: **15/15 pass**, gồm cọc 0/invalid, cọc + hóa đơn tháng, thu/hoàn/khấu trừ, idempotency, owner scope, chặn chuyển đi, webhook chữ ký cho cọc và replay. Service webhook 11 assertions pass.
- UI QA trên 127.0.0.1:5174 dùng DB riêng: nhập cọc 1.500.000 vào form (không lưu khách mới); ghi khấu trừ 10.000 từ cọc vào hóa đơn tháng, Held từ 250.000 xuống 240.000 và nợ tháng từ 50.000 xuống 40.000; link khách hiển thị đúng. Ảnh artifacts/deposit-per-tenant.png và artifacts/deposit-ledger.png, đều dữ liệu giả QA.
- Chưa kiểm tra PostgreSQL đợt này: Docker daemon không chạy. Chưa hỗ trợ thêm/sửa mức cọc sau khi lượt thuê đã được tạo, tự chuyển tiền hoàn cọc hoặc sửa/xóa quyết toán; cần yêu cầu mới nếu muốn bổ sung. Không mặc định cọc cho khách cũ.
- Backend thực hiện chạy session 75257 port 5080, FE 5173; gateway 92271 và cloudflared 49064 giữ nguyên. Các server QA và tab QA được dừng/đóng sau kiểm thử. Khi restart tunnel, cập nhật origin server rồi Xác minh lại webhook như mục 14.


## 16. Nhân bản phòng — 12/10/2026

- Phòng & người thuê → menu ba chấm của phòng → Nhân bản phòng. Có trên cả desktop/card mobile, phòng trống hoặc đang thuê.
- Dùng form tạo phòng hiện có với mode duplicate: sao chép buildingId, rent, electricityRate, waterFee, waterPerPerson, serviceFee; tên mặc định thêm (bản sao), tăng suffix nếu tên này đã có cùng dãy. Rút ngắn tên gốc để gợi ý vừa giới hạn input 80 ký tự. Có thể sửa tất cả trước khi Tạo phòng.
- Chỉ số công tơ mới mặc định 0, cần nhập số thực của phòng mới. Không sao chép người thuê/token, tiền cọc, hóa đơn/công nợ hoặc lịch sử điện. Gọi POST /api/rooms hiện có; backend scope/validation giữ nguyên, không cần endpoint nhân bản riêng.
- Không đổi CSS/theme: React19/Ant5, form và menu hiện có. Áp dụng ui-ux cho thay đổi component nhỏ. Build frontend pass, vẫn còn cảnh báo chunk lớn cũ.
- Đã tạo bản sao qua UI trên 127.0.0.1:5174/rooms với DB QA /tmp/room-rental-deposit-qa.db. HTTP read kiểm chứng id mới, 6 thiết lập khớp, occupancy=null, baseline=0, không có hóa đơn. Mở nhân bản lần hai thấy tên (bản sao 2), hủy không lưu. Không tạo phòng trên dữ liệu chủ trọ thực. Ảnh artifacts/room-duplicate.png dùng dữ liệu QA.
- Server/tab QA đóng sau kiểm thử. API thực 5080/FE5173 tiếp tục chạy. UI chung đã được kiểm tra responsive ở đợt pilot; đợt này không chạy lại toàn bộ breakpoint sweep.


## 17. Hóa đơn bổ sung từ menu phòng — 12/10/2026

- Menu ⋯ thêm Tạo hóa đơn bổ sung trên desktop/card. Phòng phải có lượt thuê hoạt động; mục bị vô hiệu ở phòng trống. Form: nội dung khoản thu (tối đa 500 ký tự), số tiền nguyên VND 1..2147483647, hạn thanh toán (mặc định hôm nay), nút Tạo hóa đơn.
- POST /api/rooms/{id}/supplemental-invoices body {requestId,occupancyId,description,amount,dueDate}. Owner authorization/approval/origin checks hiện có. OccupancyId phải là khách đang ở đúng phòng, tránh tạo cho khách khác khi dữ liệu màn hình đã cũ. Invoice Kind=Supplemental, Paid=0, Period=tháng phát hành, snapshot phòng/dãy/khách. Có thể tạo nhiều khoản bổ sung cùng phòng/tháng.
- requestId GUID dùng làm Invoice.Id để chống gửi lại: cùng payload trả hóa đơn cũ; khác payload/mismatched scope trả 409. Client giữ requestId trong lúc form đang mở và retry. Nếu đóng/mở form sau lỗi mất mạng thì requestId mới; cần kiểm tra danh sách trước khi tạo lại nếu chưa rõ lần trước đã thành công hay chưa. Không hỗ trợ chỉnh/xóa hóa đơn đã tạo trong đợt này.
- Thêm Description nullable vào Invoice, DTO và model; initializer nâng cấp SQLite/PostgreSQL cộng thêm cột, không đổi hóa đơn cũ. Backup DB thực .local-data/pre-supplemental-upgrade.db. Sau nâng cấp DB vẫn 32 hóa đơn, Total124665000/Paid6850000 như trước. Không phát hành hóa đơn thử trên DB thực.
- Trang Hóa đơn có bộ lọc Hóa đơn bổ sung (mọi kỳ); mở deep link tự chọn đúng loại. Drawer và portal khách có nội dung/số tiền thay cho breakdown điện/nước. Portal dùng link lượt thuê hiện có; checkout, thu thủ công, đối soát/webhook dùng luồng chung. Dashboard cộng Monthly+Supplemental, tiếp tục loại Deposit khỏi tổng để tránh đếm hai lần. Khấu trừ cọc vào hóa đơn vẫn chỉ hỗ trợ Monthly ở thời điểm này.
- Build backend 0 warning/error, FE TypeScript/Vite pass (cảnh báo chunk cũ). SQLite QA full suite **17/17 pass**: validation/phòng trống/scope, request replay/conflict, nhiều hóa đơn/tháng, cùng tồn tại Monthly, guest access, manual receipt, stale ended occupancy và signed supplemental webhook replay không ảnh hưởng Monthly.
- UI QA: menu → tạo phí sửa khóa 120000 → toast thành công; link khách hiện hóa đơn bổ sung, chi tiết nội dung và hạn thanh toán; bộ lọc/drawer được kiểm tra. Ảnh artifacts/supplemental-invoice-form.png và artifacts/supplemental-invoice-detail.png dùng dữ liệu QA.
- PostgreSQL chưa chạy trong đợt này (Docker daemon chưa sẵn sàng), chưa thanh toán bổ sung bằng tiền thật. Không chạy lại toàn bộ responsive sweep vì dùng menu/form/renderer có sẵn; giữ theme Ant/roomTheme.
- Backend thực restart session40135 ở port5080, FE5173 giữ nguyên. Gateway92271/tunnel49064 tiếp tục. QA38895/27901 và tab QA đóng sau kiểm tra.


## 18. Trả phòng & quyết toán — 12/10/2026

- Phòng & người thuê → ⋯ → Trả phòng & quyết toán (thay Ghi nhận chuyển đi trong UI). Drawer 780px, co theo viewport, bốn bước: chốt điện/khoản còn lại → thu nợ/khấu trừ → ghi nhận hoàn cọc → kết thúc lượt thuê. Giữ Ant/roomTheme, không đổi brand/dark mode. Chọn bố cục tuần tự theo yêu cầu triển khai của người dùng.
- GET /api/rooms/{id}/moveout trả occupancyId/tenantName/roomName/electricityRate/meterBaseline/invoices/pendingInvoiceIds. UI khóa vào occupancy khi mở từ phòng, báo đóng/mở lại nếu khách đã đổi trong lúc thao tác.
- POST /api/rooms/{id}/final-invoice body {requestId,occupancyId,currentReading,additionalAmount,description?}. Phải đúng lượt thuê đang hoạt động. Meter baseline = max InitialReading, tất cả chỉ số tháng và hóa đơn chốt cuối của phòng (qua các lượt thuê). Chỉ số tối đa 1e9, 3 chữ số thập phân; thêm phí nguyên VND >=0, tổng <=2147483647. AdditionalAmount>0 cần nội dung, 450 ký tự. Tính điện từ phần tăng * giá điện hiện tại, làm tròn VND; không cộng lại rent/water/service hàng tháng tự động.
- Hóa đơn cuối là Supplemental, IsFinalMeterReading=true, ElectricityAmount/ServiceAmount là điện và phí còn lại. Tổng 0 vẫn có bản ghi chốt, Status=Paid, không có receipt giả. Chỉ một bản ghi chốt cho một lượt thuê (filtered unique index). RequestId=Invoice.Id, retry chính xác trả bản cũ; sai payload 409. Sau chốt, API nhập điện tháng chặn để tránh hóa đơn trùng. Chưa có sửa/hủy bản chốt; cần kiểm tra số trước khi xác nhận.
- Deposit deduction mở rộng target từ Monthly sang Monthly/Supplemental cùng lượt thuê, vẫn transaction/held/debt/pending/idempotency guards. DepositLedger ở trang hóa đơn cũng cập nhật lựa chọn và invalidate moveout.
- Drawer hiển thị debt non-Deposit, held actual Paid trừ settled, số thu thêm/hoàn sau khấu trừ. Mỗi hóa đơn có Trừ cọc (min held/debt), Ghi nhận đã thu thêm (cho phép thu từng phần), Đối soát payOS. Hoàn cọc chỉ bật khi hết nợ, cọc vẫn còn và không có pending cọc. Đây là ghi nhận hoàn ngoài hệ thống, không chuyển tiền thật.
- POST /api/rooms/{id}/complete-moveout {occupancyId,finalInvoiceId}: transaction serializable, scope đúng owner/phòng/lượt thuê và final invoice; chặn pending bất kỳ, non-Deposit unpaid, held>0. EndDate hôm nay, inactive, revoke token, cập nhật baseline công tơ. Exact retry lượt thuê đã kết thúc trả success và không tác động khách mới. Legacy end-occupancy giữ để tương thích, thêm chặn non-Deposit debt nếu lượt thuê đã có chốt; vẫn cho kết thúc chưa chốt theo hành vi cũ. UI mới dùng complete-moveout.
- InvoiceDto/model thêm bool IsFinalMeterReading; SQLite/PG initializer cộng cột boolean mặc địnhfalse/index unique, không thay đổi hóa đơn cũ. Đã backup DB thực .local-data/pre-moveout-upgrade.db; sau nâng cấp số hóa đơn/tổng tiền vẫn 32/124665000/Paid6850000. Không thử trả phòng trên DB thực.
- Build backend 0 warning/error; FE TypeScript/Vite pass (chunk warning cũ). Full SQLite QA **20/20 pass**: meter delta/no duplicate rent, monthly+Supplemental deduction, refund guard, pending payOS, zero final, owner scope/stale occupancy, final replay/conflict, chặn readings sau chốt, complete replay không chấm dứt khách mới, meter baseline mới115 thay vì110. Không chạy PostgreSQL đợt này (Docker daemon chưa sẵn sàng).
- UI QA trên127.0.0.1:5174: chốt 100→105 với phí50000, debt210000/held240000; trừ cọc vào tháng40000, bổ sung120000, cuối50000; ghi nhận hoàn30000; hoàn tất phòng trống. Không chuyển tiền thật. Case không cọc: điện5kWh*3500 + thêm32500 =50000; ghi nhận thu25000 hai lần, debt về0, chứng minh khóa idempotency không chặn hai khoản thu hợp lệ giống nhau sau thành công. Case thứ hai được giữ trong DB QA, không phải DB người dùng.
- Responsive ở375px: document width375, drawer client/scroll width375, không tràn ngang; chưa quét toàn bộ mọi breakpoint. Ảnh artifacts/moveout-ready.png và artifacts/moveout-mobile.png dùng dữ liệu QA. Đã reset viewport.
- Giới hạn: không tự tính tiền thuê theo ngày; chủ trọ nhập phí/tiền thuê còn lại đã thỏa thuận, tránh khoản đã có trên hóa đơn khác. Không hỗ trợ bỏ nợ/non-Deposit writeoff trong luồng mới. Cọc chưa thu không coi là tiền đang giữ và không tự thu thêm lúc trả phòng. Chưa có biên bản xuất PDF, sửa điện cuối kỳ, đổi công tơ hoặc thử thanh toán cuối kỳ bằng tiền thật.
- Backend thực port5080 session13144; FE5173, gateway92271/cloudflared49064 giữ nguyên. QA36193/48494 và tab QA đóng khi kết thúc; docs/README/api-contract cập nhật.


## 19. Chốt tên Rehouse — 13/10/2026

- Người dùng chọn tên **Rehouse** sau khi trao đổi các phương án. Đã cập nhật tên hiển thị ở sidebar/mobile drawer, đăng nhập/đăng ký, tài khoản chờ duyệt, portal khách, settings và tiêu đề tab. README đổi tiêu đề. Giữ màu/icon/font và định danh kỹ thuật/cookie/database đang có để không ảnh hưởng dữ liệu hay phiên đăng nhập.
- Đã tra cứu sơ bộ trước đó: rehouse.vn dùng tên trong lĩnh vực nội thất/nhà ở; Rehouse Group ở Anh hoạt động bất động sản. Đây chưa phải tra cứu quyền nhãn hiệu đầy đủ, chưa xác minh quyền đăng ký/sử dụng tại Việt Nam. Người dùng chốt tên; không coi quyết định này là chứng nhận pháp lý hay đăng ký nhãn hiệu/tên miền.
- Các đoạn “Nhà Mình/nhà mình” trong lịch sử bàn giao và ảnh cũ ghi nhận brand cũ, không phải tên hiện hành. Chưa thiết kế logo mới hoặc mua tên miền.

- Kiểm chứng đổi tên: frontend TypeScript/Vite build pass; giao diện local đã hiện Rehouse trong menu và title tab. Ảnh artifacts/rehouse-brand.png.

## 20. Đa ngôn ngữ toàn ứng dụng — 13/10/2026

- Người dùng chọn Việt + Anh + Trung + Hàn + Ấn và xác nhận **toàn ứng dụng**. Đã triển khai vi/en/zh-CN/ko/hi; Trung giản thể, “Ấn” = Hindi (đã báo giả định cho người dùng).
- 551 khóa giao diện, đủ 4 catalog dịch; menu, dashboard, dãy/phòng, chỉ số, hóa đơn, payOS settings, admin duyệt tài khoản, auth/account-status/not-found, tiền cọc, bổ sung, moveout và portal khách dùng chung `t`. Không thêm thư viện hoặc API dịch. Dùng bộ locale có sẵn của Ant Design/Day.js.
- Bộ chọn ngôn ngữ ở header và các trang public; lưu rehouse.language trong localStorage, mặc định Việt, vẫn hoạt động khi storage bị chặn. Chuyển ngôn ngữ giữ state component, không remount/đăng xuất. Labels/rules vốn nằm module scope đã chuyển vào render để cập nhật đúng.
- Hộp cấp link có lựa chọn ngôn ngữ khách; thêm lang vào URL hiện hành, không đổi token/quyền truy cập/thời hạn. Portal nhận lang, ghi nhớ cho lần quay về từ payOS, vẫn cho khách đổi. Các tham số payment không bị mất.
- VND giữ nguyên, chỉ đổi format; ngày hiển thị theo locale, kỳ nghiệp vụ vẫn Asia/Ho_Chi_Minh. Dữ liệu nhập và lịch sử mô tả/ghi chú không tự dịch. ApiError thông báo hiện tại lấy theo locale khi đọc; lỗi API đã biết ánh xạ guidance, lỗi mới/provider chưa biết dùng fallback status ngoài vi. Chưa đổi contract/backend error codes. Trang payOS bên ngoài không do bộ dịch Rehouse điều khiển.
- `docs/I18N.md` ghi cách bảo trì. `frontend/scripts/build-i18n.mjs` sinh JSON từ source.json/translations.tsv; `check-i18n.mjs` kiểm coverage/placeholders/UI literals/preference/URL/interpolation/errors/VND/dates. Không giữ script migration một lần.
- Kiểm tra: i18n check pass 519 khóa x4; FE build pass (chunk warning đã có). Trình duyệt đổi đủ5 ngôn ngữ ở Rooms, form/rules Anh, form Hàn, link thực mở Hindi đọc-only; portal và login Hindi375px không tràn ngang. Chưa quét mọi màn/breakpoint, chưa review bản dịch bởi người bản ngữ, chưa làm giao dịch thật đa ngôn ngữ. Không thay đổi backend hoặc dữ liệu thuê/thu tiền trong lượt này.
- Ảnh artifacts/rehouse-languages-mobile.png hiển thị form đăng nhập trống và đủ5 lựa chọn, không lộ khóa hoặc token khách. Các tab kiểm tra tạm đóng, viewport reset; lựa chọn trình duyệt đưa về Việt.

- Sửa tiếp header portal: selector `.tenant-header span` từng áp margin-top5px của phụ đề logo vào các span của Ant Select, gây lệch chữ/icon. Đổi markup copy logo thành `.tenant-brand-copy`, giới hạn các rule phụ đề tại `.tenant-brand-copy > span`. Kiểm chứng trên tab Edge tiếng Hàn: tâm theo chiều dọc của Select, selection-item và arrow đều37.5px, text margin-top0; FE build pass.


## 21. QR inline cho thanh toán payOS — 13/10/2026

- Endpoint `POST /api/tenant/{token}/invoices/{id}/payment` trả `PaymentCheckoutDto`: `checkoutUrl`, `qrCode`, `amount`, `orderCode`, `accountName`, `accountNumber`, `bankBin`, `description`, `status`, `expiresAt`. QR và thông tin tài khoản chỉ lưu sau khi kiểm chữ ký payOS cùng order/amount khớp. `expiresAt` lấy từ `expiredAt` của payOS và là Unix seconds. Các trường metadata có thể null; pending cũ vẫn tái sử dụng order/url, `qrCode` null thì portal đưa lựa chọn mở hosted checkout bằng nút rõ ràng nếu URL đúng HTTPS `pay.payos.vn`. Không tạo order thứ hai cho pending và không tự chuyển hướng.
- Portal hiển thị QR, số tiền/chủ tài khoản/nội dung/thời hạn, cho sao chép, kiểm tra thủ công và đối soát khi modal mở/tab hiển thị. Overview làm mới mỗi 5 giây, reconcile khoảng 20 giây và backoff khi lỗi; cả hai dừng khi tab ẩn/modal đóng. Generation guard bỏ response cũ sau khi đóng checkout/đổi token. Khi QR hết hạn hoặc provider trả PAID nhưng invoice chưa được xác nhận, UI ẩn mã/link và tiếp tục chờ. Chỉ invoice đã được cập nhật mới hiện thành công/số tiền đã thanh toán. Lỗi refetch chung giữ dữ liệu đang có, lỗi 401/403/404 kết thúc quyền truy cập.
- Migration SQLite/PostgreSQL thêm 7 nullable fields cho `PayOsAttempts`: `QrCode`, `AccountName`, `AccountNumber`, `BankBin`, `Description`, `ProviderStatus`, `ExpiresAt`. Không đổi guards invoice/payment, xác minh callback/webhook hay replay protection.
- Kiểm tra service fake `HttpClient`: 45 assertions pass (11 kiểm webhook registration cũ + 34 checkout/payment mới): signed QR roundtrip/persistence, reuse pending, legacy pending không QR, invalid signature/amount/order, provider PAID không ghi nhận khi chưa có số tiền xác minh, đối soát thiếu amount, webhook đúng/sai amount và replay idempotent. Fake handler chặn mọi provider request ngoài process.
- API integration suite **20/20 pass** với DB SQLite disposable `/tmp/room-rental-qr-qa.db`, `WebhookBaseUrl=http://localhost:5082`; không tạo giao dịch với payOS thật. Initializer chạy trên bản copy riêng `/tmp/room-rental-qr-init-qa.db`: SQLite integrity `ok`, số dòng Users170, Buildings108, Rooms113, Occupancies112, Invoices106, Receipts57, PayOsAttempts27, ProcessedWebhooks18 không đổi; 7 cột nullable được thêm. FE `npm run build` pass (còn cảnh báo bundle chung 1.14 MB); `npm run i18n:check` pass 551 khóa ×4 catalog.
- Browser QA bằng CUA và local mock server có payload/account giả không thể thanh toán: desktop QR hiển thị; ở 375×812 không tràn ngang (document/body 375px, modal351px), QR render và modal cuộn nội bộ (948px nội dung/667px chiều cao thấy được). QR-null legacy hiện hosted fallback hợp lệ; hostname ngoài payOS bị ẩn. Reconcile giả báo Paid nhưng invoice Unpaid vẫn chờ và ẩn QR/link; khi invoice mock được xác nhận Paid thì portal hiện “Amount paid ₫425,000” và trạng thái Paid. Nút sao chép hiện toast thành công nhưng không xác minh độc lập nội dung clipboard. Ảnh synthetic ở `tests/artifacts/rehouse-inline-qr-desktop.jpg` và `tests/artifacts/rehouse-inline-qr-mobile.jpg`. Không kiểm tra expiry, đóng modal khi reconcile còn bay, hoặc lỗi overview cache trong lượt QA này.
- Rollout backend thực: API khỏe tại `localhost:5080`, session58025/PID46365; integrity `ok` và đủ 7 cột. Backup mode0600 tại `backend/RoomRental.Api/.local-data/room-rental.pre-qr-checkout-20261012T184125Z.db`. Snapshot ngay sau khởi động giữ nguyên 32 invoices, tổng `124665000` VND và Paid `6850000` VND. Không agent nào tạo payment/transfer mới hoặc sửa hóa đơn trên DB thật; đối soát định kỳ bình thường được giữ cho một payment pending có sẵn theo chỉ đạo của người dùng. FE5173, gateway5081 và tunnel không đổi; mock5082/FE QA5174 và tab CUA thử nghiệm đã dừng/đóng sau kiểm tra.
- Chưa thực hiện giao dịch payOS/ngân hàng thật; kiểm thử chỉ chứng minh xử lý chữ ký, dữ liệu và trạng thái nội bộ. Khi deploy, tiếp tục xác minh một giao dịch có sự đồng ý/thao tác của khách và webhook/đối soát thật trước khi mở rộng.


## 22. Trang Rehouse checkout riêng — 13/10/2026

- Nút **Pay/Thanh toán** trong portal điều hướng sang trang checkout Rehouse riêng, không mở modal: `/t/{token}/invoices/{invoiceId}/checkout`; alias `/tenant/{token}/invoices/{invoiceId}/checkout` cũng được hỗ trợ. Query hiện tại như `?lang=en` được giữ khi đi vào và khi quay về. Back trong trang và lịch sử trình duyệt đều quay lại portal đúng token/query.
- Trang xác minh lại overview và scope hóa đơn trước khi tạo/tái sử dụng checkout; một lần mount chỉ gọi create một lần, còn pending được backend tái sử dụng. Hóa đơn thiếu/đã trả không tạo checkout. QR nullable tiếp tục hiển thị fallback có nút mở hosted checkout rõ ràng chỉ với HTTPS `pay.payos.vn`; trang không tự redirect. Provider `paid` khi invoice chưa Paid giữ giao diện chờ, ẩn QR/link; chỉ overview/reconcile có invoice Paid mới hiện thành công và số tiền đã trả. Polling/reconcile giữ như mô tả tại [API contract](api-contract.md).
- UI QA bằng CUA trên mock server chạy riêng tại localhost đã xác nhận route/query/back, QR synthetic, legacy QR-null fallback an toàn, một create request trên mount, và quy tắc invoice-authoritative: `providerCreateStatus=paid` cùng `reconcileMode=provider-paid` vẫn chờ cho đến khi invoice mock được đổi sang Paid; sau đó Check now hiện Paid / `Amount paid ₫425,000`. 375×812: document/body 375 px và SVG QR render; desktop 1466 px không tràn ngang. Screenshot dùng payload/account giả không thể thanh toán: `tests/artifacts/rehouse-checkout-page-desktop.jpg`, `tests/artifacts/rehouse-checkout-page-mobile.jpg`.
- Kiểm tra frontend cuối: `npm run build` pass (frontend agent xác nhận); `npm run i18n:check` pass 554 khóa ×4 catalog. Không chạy lại backend API suite vì thay đổi chỉ ở route/UI; các kết quả service/API/migration trong mục 21 vẫn là kiểm tra backend gần nhất. QA chỉ sửa state trong mock process trong bộ nhớ; không gọi payOS, không tạo chuyển khoản, không sửa hóa đơn hoặc database thật.
- Chưa kiểm tra hard refresh trực tiếp trên route checkout, UI hết hạn, hoặc mở link hosted ở trình duyệt. Đây là các giới hạn của lượt QA, không phải xác nhận các trường hợp đó đã được kiểm thử.


## 23. PostgreSQL Docker QA và tải đọc giới hạn — 13/10/2026

- Kiểm tra Production Docker image với PostgreSQL 17 trên Compose project dùng riêng `rehouse-pg-qa`, Caddy TLS cục bộ và dữ liệu fixture tổng hợp. PostgreSQL schema khởi tạo/lặp lại thành công; các cột checkout nullable `QrCode`, `AccountName`, `AccountNumber`, `BankBin`, `Description`, `ProviderStatus`, `ExpiresAt` có mặt. API qua TLS local health trả 200. Callback QA trỏ HTTP localhost để không gọi payOS.
- HTTP API integration: `tests/test_api_integration.py`, 16/16 pass trong 3.396 giây. Test tạo dữ liệu tổng hợp trong DB dùng một lần; không chạy SQLite-only fixture `test_payos_fixture.py` trên PostgreSQL. Không tạo checkout, không gọi payOS và không dùng DB/khóa production.
- Read-only load probe: `tests/load_postgres_readonly.py` tạo một owner/phòng/occupancy giả trước khi đo; hai stage chỉ GET overview khách thuê trong 5 giây, lần lượt 50 và 100 worker. 50 worker: 7.085 request/5.017 giây, 1.412,3 request/giây, p50 29,8 ms, p95 44,8 ms. 100 worker: 7.078 request/5.051 giây, 1.401,4 request/giây, p50 57,3 ms, p95 92,0 ms. Cả hai stage đều chỉ trả HTTP 200, không có HTTP 429 hoặc lỗi truyền tải.
- Đây là phép đo cục bộ cache nóng với một tenant/phòng tổng hợp, API và PostgreSQL chạy cùng máy qua proxy; host Darwin arm64 có 12 logical CPU/24 GiB RAM, Docker VM 12 CPU/7,65 GiB RAM. Không đặt giới hạn CPU/RAM riêng cho container. Kết quả không phải ước tính số người dùng hay năng lực production; không đo ghi dữ liệu, nhiều tenant, mạng thật hoặc payOS. Probe có chặn đích chỉ cho HTTPS localhost:18443, TLS verify bật, tối đa 5 giây/stage và 20.000 request/stage.
- Docker QA project `rehouse-pg-qa`, volume, image tags và fixture `/tmp/rehouse-pg-qa` đã được dọn sau kiểm thử. Không còn instance QA của đợt mục này; PostgreSQL migration target cục bộ được tạo sau đó và mô tả ở mục 25. API 5080, FE 5173, gateway 5081 và container `edusphere` không bị thay đổi trong lượt QA. Chi tiết cách chạy và kết quả nằm trong [báo cáo PostgreSQL QA](POSTGRES_QA.md); hướng dẫn test ở [tests/README.md](../tests/README.md).


## 24. Runbook ứng phó tăng trưởng nhanh Rehouse — 13/10/2026

- Đã tạo [runbook tăng trưởng nhanh](SCALING_RUNBOOK.md) dựa trên code hiện tại và kết quả PostgreSQL QA mục 23. Nội dung gồm trạng thái hiện có/chưa có, ngưỡng cảnh báo **đề xuất** (chưa có telemetry cấu hình), checklist trước public launch, playbook burst 10×, SQLite→PostgreSQL cutover/restore guardrails, giữ webhook/đối soát và các điều kiện cần trước scale-out.
- Đây là tài liệu kế hoạch; không đổi service/compose, database, secrets, polling, limiter hoặc số replica. Không có cam kết users/RPS; kết quả một tenant/room QA không phải capacity benchmark. Chưa triển khai ra internet; telemetry, EF migrations, restore drill, shared/distributed limiter, job lease/fairness và runtime incident knobs còn cần làm.


## 25. Chuyển database cục bộ từ SQLite sang PostgreSQL — 13/10/2026

- Người dùng cho phép chuyển database đang dùng; API được dừng bình thường trong khoảng 2 phút 30 giây. SQLite online backup cuối cùng: `backend/RoomRental.Api/.local-data/sqlite-to-postgres/room-rental-final-frozen-20261013.db` (0600, integrity `ok`, foreign-key violations 0). SQLite gốc vẫn được giữ. Import đích `room_rental` hoàn tất khi API dừng, rồi API Development chạy lại bằng PostgreSQL; backend xác nhận không còn kết nối SQLite sau khi khởi động.
- PostgreSQL 17.11 chạy trong Compose project `rehouse-pg-migration`, container `rehouse-pg-migration-db`, named volume bền vững `rehouse-pg-migration-data`, host port chỉ bind loopback `127.0.0.1:15432`. Database hiện dùng là `room_rental`. API tiếp tục chạy host-side trong cùng content root `backend/RoomRental.Api` tại `localhost:5080`; cấu hình Development đặt `DatabaseProvider=Postgres`, `SeedDemo=false`. Không mở cổng PG ra LAN/Internet.
- Import được kiểm chứng độc lập trước khi restart API: đủ 13 bảng, 404/404 dòng; không thiếu/thừa dòng và không trường nào lệch sau chuẩn hóa GUID, decimal, ngày và DateTimeOffset về UTC/microsecond. Các kiểm tra dữ liệu về tham chiếu, email/unique nghiệp vụ, idempotency, một Pending attempt mỗi hóa đơn và `Invoice.Paid = tổng Receipts` đều có 0 vi phạm ở hai phía. 18 cột PostgreSQL quan trọng (UUID, numeric precision/scale, date, boolean, timestamptz, bigint và enum/string) đúng kiểu.
- Tài chính khớp: 32 hóa đơn, tổng `124.665.000` VND, đã trả `6.850.000` VND và receipts `6.850.000` VND. Có 10 receipts; 11 payOS attempts gồm 1 Pending, 5 Paid, 5 Failed. So sánh tổng hợp theo từng owner có 0 sai khác. Không tạo checkout/receipt/transfer giả.
- DataProtection giữ cùng content root và key ring mặc định `~/.aspnet/DataProtection-Keys`. Bản sao bảo vệ cutover nằm trong `backend/RoomRental.Api/.local-data/sqlite-to-postgres/DataProtection-Keys-cutover-20261013/` (0700). Với application discriminator hiện tại, 38/38 tenant token được mở bằng key ring và hash khớp; 14/14 bộ payOS API/checksum key được mở ở cả SQLite và PostgreSQL, hash plaintext nguồn/đích khớp. Không ghi token, khóa hoặc session cookie ra log/tài liệu.
- Sau restart, `GET /api/health` trả 200; một tenant overview GET bằng token cũ còn hiệu lực trả 200 và một hóa đơn. Không có owner browser session đang đăng nhập để kiểm tra route owner-auth; GET không xác thực `/api/auth/me` và `/api/settings/payment` trả 401. Không đăng nhập/tạo session mới trong QA. Việc kiểm tra DP và toàn bộ bản ghi `AuthSessions` khớp không tự chứng minh một cookie cụ thể còn hiệu lực. Sau khởi động, số hóa đơn/receipts vẫn lần lượt là 32/10 với tổng tiền không đổi. Đối soát bình thường cho attempt Pending được phép hoạt động; verifier không gọi payOS và không gửi POST.
- Các backup cấu hình/DB trước khởi động: frozen SQLite như trên; logical PostgreSQL dump `backend/RoomRental.Api/.local-data/postgres-migration/room_rental-pre-api-start-20261013.dump` (0600, 58 mục trong archive list; restore tạm xác nhận 13 bảng/404 dòng); cấu hình cũ `backend/RoomRental.Api/.local-data/sqlite-to-postgres/appsettings.Development.local.before-postgres-cutover-20261013.json` (0600). Connection credential chỉ lưu ở file ignored `backend/RoomRental.Api/.local-data/postgres-migration/postgres.env` (0600); không đưa giá trị vào log/tài liệu. Cách tái tạo môi trường thử, lệnh import có guard, khởi động và rollback nằm trong [hướng dẫn migration](sqlite-to-postgres-migration.md).
- Đây là chuyển đổi local đã xác minh, chưa phải production deployment. Không có reverse importer PostgreSQL→SQLite hoặc EF migration history; không rollback bằng cách chỉ đổi connection string sau khi PostgreSQL đã nhận writes. Trước rollback, dừng writes, backup PostgreSQL và key ring cùng restore point rồi đối chiếu/replay mọi delta; ưu tiên sửa tiến về phía PostgreSQL. Không xóa volume.
