# Roomie System Design

Tài liệu tiếng Việt ngày17/10/2026: [Thiết kế hệ thống](Roomie_System_Design_2026-10-17.docx).

## Phạm vi và nguồn

Baseline ứng dụng: e869b76, CI/CD38880915428 thành công theo GitHub Actions được đọc trong lượt tạo tài liệu. Không kiểm tra lại container VPS hoặc chạy test nghiệp vụ trong lượt này. Nguồn đối chiếu: Program.cs, Domain/Entities.cs, Domain/ApiDtos.cs, auth/payment/billing endpoints, ManualReceiptService, RegistrationVerificationService, deploy/compose.yaml, api-contract và backup-operations. Không đưa thay đổi local chưa phát hành thành trạng thái live.

Tài liệu mô tả kiến trúc, quan hệ dữ liệu, giao dịch, API, chống trùng, bảo mật, triển khai, backup và các quyết định mở. SLO, tải và RPO/RTO chưa chốt được ghi là câu hỏi; các mốc tiếp theo là đề xuất.

## Kiểm tra tài liệu

- Dùng bản sao mẫu System Design, giữ nguyên bản tham chiếu;7trang,12mục,9bảng và1sơ đồ riêng cho Roomie.
- Render bằng runtime tài liệu đóng gói; kiểm tra toàn bộ trang, tiếng Việt, bảng, sơ đồ và ngắt trang.
- Giữ nguyên section/page setup, styles, numbering, font parts và header; chỉ thay nội dung, hình kiến trúc, chú thích nguồn, footer và đích hyperlink.
- Không chứa mật khẩu, khóa OAuth/payOS, dữ liệu khách, IP quản trị hoặc định danh thư mục backup riêng.
- SHA256 DOCX: a6216b440943f3970873991e8f259a22095f4029adc1d9b48b7a26f7f98ef3ed

Tài liệu được tạo local, chưa commit/push trong lượt này.
