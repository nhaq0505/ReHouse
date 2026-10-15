# Kế hoạch SEO Roomie

Chốt ngày 15/10/2026, giờ Việt Nam. Tên miền chuẩn: https://roomie.io.vn.

**Thay đổi yêu cầu 15/10/2026:** người dùng yêu cầu “robots.txt đóng hết tất cả”. Cấu hình hiện tại là `User-agent: *` / `Disallow: /`, gồm cả Googlebot; đã live trên tên miền chính và www qua commit `65d4907`, pipeline `38672131045` thành công. Tạm dừng việc cho phép crawl và gửi sitemap/yêu cầu index; chỉ mở lại khi người dùng yêu cầu. `frontend/public/robots.txt` là nguồn duy nhất, Vite sao chép nguyên trạng sang bản build. Kế hoạch mở crawl bên dưới là lịch sử trước thay đổi này. Robots là chỉ thị cho bot tuân thủ, không chặn cứng bot cố tình bỏ qua và không tự xóa URL đã có trong Google.

## Mục tiêu và nguyên tắc

- Thu hút chủ trọ Việt Nam tìm phần mềm quản lý phòng trọ, dẫn về đăng ký.
- Giữ thương hiệu và giao diện hiện tại. SEO tiếng Việt trước; chưa GA4, backlink trả phí hoặc SEO đa ngôn ngữ.
- Đo index, impressions, clicks, CTR và truy vấn bằng Google Search Console. Chưa có dữ liệu nền, không cam kết thứ hạng hoặc traffic.
- **Sau mỗi đợt SEO, cập nhật [SEO_LOG.md](SEO_LOG.md)**: thời gian Việt Nam, mục tiêu, thay đổi/file/URL, kiểm tra và bằng chứng, trạng thái phát hành, kết quả, tồn đọng. Không ghi token khách, thông tin cá nhân hoặc khóa bí mật.
- Phân biệt đã sửa local, đã kiểm thử, đã commit, đã deploy và Google đã index. Không suy ra deploy từ build/push; không suy ra index từ HTTP 200.

## Tuần 1–2: nền tảng

- [x] Khảo sát React/Vite, backend .NET và các route công khai/riêng tư.
- [x] Chốt tên miền, đối tượng, 4 bài trọng tâm và Search Console.
- [x] Tạo HTML sẵn từ cùng component React cho trang chủ, nội dung đọc được không cần JavaScript (local).
- [x] Canonical `/`, HTTP 301 `/welcome`, metadata theo route, Open Graph và ảnh chia sẻ (local).
- [x] Robots, sitemap chỉ URL công khai, JSON-LD Organization/WebSite từ dữ kiện thật (local).
- [x] Noindex tài khoản, nghiệp vụ, link khách, API, tên miền demo và biến thể ngôn ngữ khác tiếng Việt; HTTP 404 thật cho URL lạ (local).
- [x] Build, kiểm tra HTTP trên backend phục vụ bản build, trình duyệt và i18n (local); HTML tĩnh 375px/1440px không tràn ngang.
- [ ] Phát hành và kiểm tra lại công khai.
- [x] Xác minh Domain property Search Console qua DNS (15/10/2026); Google xác nhận quyền sở hữu.
- [ ] Gửi sitemap sau phát hành và lưu số liệu nền khi Google xử lý xong; sitemap public hiện404, báo cáo đang chờ dữ liệu.

## Tuần 3–6: nội dung (chưa thực hiện)

Khảo sát kết quả tìm kiếm tiếng Việt trước khi biên soạn; không tự gán lượng tìm kiếm.

| Tuần | URL | Nội dung |
| --- | --- | --- |
| 3 | `/huong-dan/quan-ly-phong-tro` | Quy trình quản lý phòng, người thuê và khoản thu |
| 4 | `/huong-dan/tinh-tien-dien-phong-tro` | Tính chênh lệch chỉ số công tơ, ví dụ minh họa |
| 5 | `/huong-dan/quan-ly-cong-no-phong-tro` | Hóa đơn chưa thu, thu một phần và đối soát |
| 6 | `/huong-dan/thu-tien-phong-tro-qua-qr` | Gửi hóa đơn, thanh toán và xác nhận payOS |

Thêm mục lục `/huong-dan`, liên kết nội bộ và CTA. Mỗi bài có metadata, H1, ngày cập nhật và ảnh dữ liệu mẫu; chỉ mô tả tính năng đã có. Dùng nguồn chính thức nếu đề cập giá điện/quy định. Chỉ thêm bài vào sitemap sau khi xuất bản.

## Tuần 7–8: đo và cải thiện (chưa thực hiện)

- Kiểm tra URL Inspection, nguyên nhân chưa index và sitemap.
- Ghi Search Console hàng tuần, so sánh khoảng thời gian tương đương khi đủ dữ liệu; chưa đo chuyển đổi đăng ký từ SEO.
- Sửa nội dung/title/liên kết nội bộ theo truy vấn thực tế; đo Lighthouse và Core Web Vitals khi đủ dữ liệu thực địa.

## Vận hành nền tảng SEO

- `npm --prefix frontend run build` tạo `dist/index.html` có HTML/CSS sẵn, `app.html` riêng cho SPA, `robots.txt` và `sitemap.xml`. Dockerfile hiện có tự chạy bước này, không cần Node ở runtime.
- Nguồn nội dung công khai dùng chung React `LandingContent`; metadata/URL xuất bản ở `frontend/src/seo/site.ts`. Thêm bài ở các tuần sau phải đăng ký renderer/output, route React và route công khai phía backend; không thêm URL chưa phát hành vào sitemap.
- Mặc định Development noindex. Production chỉ cho index trên host `roomie.io.vn`; host demo/local không index. `Seo__AllowIndexing=false` tắt index toàn bộ; Docker Compose hỗ trợ biến `SEO_ALLOW_INDEXING=false` trong file env. Đây là chỉ thị cho công cụ tìm kiếm, không thay thế xác thực/phân quyền.
- `/welcome` và `/index.html` chuyển 301 về `/`, giữ query; SPA riêng không kế thừa canonical/nội dung trang chủ. URL lạ trả 404 từ backend; điều hướng trong SPA dùng metadata noindex cho trang không tồn tại.
- Giao diện đổi ngôn ngữ hiện có được giữ lại; `?lang=` khác `vi` nhận noindex từ backend. Chưa có URL ngôn ngữ riêng hoặc hreflang.
- Khi phát hành: kiểm tra HTTPS, redirect www và `/welcome`, HTML trang chủ, sitemap/robots, noindex trang riêng và demo, lỗi 404. Đối chiếu image/commit đang chạy rồi mới ghi trạng thái đã deploy.
- Search Console: đăng nhập tài khoản chủ sở hữu → thêm Domain property `roomie.io.vn` → thêm đúng TXT xác minh Google cấp vào DNS → Verify → gửi `https://roomie.io.vn/sitemap.xml` → URL Inspection trang chủ. Không tự tạo mã xác minh; không ghi tài khoản/secret vào nhật ký. Chỉ ghi trạng thái Google báo và khoảng thời gian số liệu thực tế.

## Nguồn kỹ thuật

- [Google: JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Google: sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Google Search Console](https://search.google.com/search-console/about)
