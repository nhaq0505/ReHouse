# EF Core Migrations — 15/10/2026

## Cơ chế mới

API dùng `MigrateAsync()` trước khi phục vụ request, sau đó mới seed Development hoặc bootstrap admin. Đã bỏ `EnsureCreated` và SQL nâng schema thủ công trong startup. Không tự xóa dữ liệu khi khởi động. DB legacy chưa reset sẽ không chạy được initial migration.

Hai context `SqliteAppDbContext` / `PostgresAppDbContext` kế thừa mô hình chung `AppDbContext`, mỗi provider có initial migration và snapshot riêng trong `backend/RoomRental.Api/Data/Migrations`. Services vẫn dùng scoped `AppDbContext`. Công cụ import SQLite→Postgres cũng tạo target bằng migrations; bỏ qua bảng lịch sử EF khi kiểm tra bảng dữ liệu.

## Khi thay đổi model

Từ thư mục gốc:

```sh
dotnet tool restore
dotnet ef migrations add TenThayDoi --project backend/RoomRental.Api --context SqliteAppDbContext --output-dir Data/Migrations/Sqlite
dotnet ef migrations add TenThayDoi --project backend/RoomRental.Api --context PostgresAppDbContext --output-dir Data/Migrations/Postgres
```

Đọc cả hai `Up`/`Down`, kiểm thử bằng DB dùng thử rồi commit migration + designer + snapshot. Không sửa initial migration sau khi đã phát hành. CI kiểm tra model không lệch snapshot của cả hai provider. Các factory chỉ đọc connection từ biến môi trường `ConnectionStrings__DefaultConnection`; không tự đọc cấu hình local hoặc secrets production. Giá trị mặc định chỉ dùng scaffold, không phải DB vận hành.

Startup migration phù hợp một instance hiện tại. Khi chạy nhiều replica, tách bước apply migrations thành job triển khai có kiểm soát. Rollback image không tự rollback schema; migration phá hủy dữ liệu cần kế hoạch backup/restore riêng.

## Chuyển DB cũ sang DB mới

User xác nhận dữ liệu cũ có thể bỏ, áp dụng cả local và VPS. Reset chỉ là thao tác chuyển đổi lần đầu, không đưa vào CI/CD hay startup.

1. Xác định đúng DB `room_rental`, giữ nguyên secrets/SMTP/DataProtection.
2. Backup DB và dừng app để ngừng ghi.
3. Chạy `deploy/reset-legacy-database.sql` bằng `psql -v ON_ERROR_STOP=1` trên đúng DB. Script có transaction, kiểm tra tên DB/schema, danh sách bảng và từ chối chạy nếu đã có `__EFMigrationsHistory`. Không dùng `CASCADE`, không xóa volume hoặc DB khác.
4. Khởi động image mới: migration tạo schema, bootstrap admin từ cấu hình hiện có (VPS); local seed demo theo cờ Development.
5. Kiểm tra health, admin và `__EFMigrationsHistory`; khởi động lại phải báo không có migration mới, dữ liệu vẫn giữ.

Không khởi động lại image legacy giữa bước reset và triển khai image mới vì `EnsureCreated` cũ sẽ tạo schema không có lịch sử EF.

## Nhật ký kiểm chứng

- Build API / DbMigrator và publish Release: PASS.
- SQLite: initial migration, snapshot, filtered unique indexes, apply lại giữ dữ liệu và từ chối DB legacy mà không xóa dữ liệu — PASS trong service suite.
- PostgreSQL17 tạm: API20/20 PASS, SEO13/13 PASS; bốn filtered unique index được tạo; restart báo database đã cập nhật. Lần SEO đầu thiếu webroot nên404; chạy lại với frontend/dist làm webroot thì PASS.
- Reset SQL: áp trên bản sao schema legacy trong container riêng, còn0 bảng sau reset — PASS.
- Local đã backup `/tmp/roomie-ef-backups/local-before-migrations.dump`, dừng API cũ, chạy reset SQL và khởi động API mới5080. Health OK; PostgreSQL có1initial migration,1admin+1owner demo và0invoice. Không chạy integration suite vào DB này.
- VPS backup DB + DataProtection trước chuyển đổi: `/var/backups/rehouse/rehouse-20261015T043912Z-rnmMSm`. Đã xác nhận bootstrap admin được cấu hình (không ghi secrets). Chưa reset VPS hoặc phát hành tại checkpoint này.

### Tiếp tục 16/10/2026

- Run38682614280 dừng ở snapshot check: SDK container mới thiếu package EF Design do `--no-build` dùng assets của container trước. Bổ sung `dotnet restore backend/RoomRental.Api --force` trước EF check; chạy nguyên bước trong SDK container mới PASS cảhai snapshot. Build và service tests ở run cũ đều PASS; chưa deploy nên VPS vẫn chạy image cũ.
- VPS đã chuẩn bị hook reset dùng một lần trong deploy helper, sau backup và trước app swap, cùng ops lock. Hook chỉ nhận revision đã chỉ định; SQL chỉ chạy một lần, sau đó marker được chuyển thành applied. Bản helper gốc ở `/root/rehouse-deploy-before-ef-reset-20261016`; sẽ khôi phục sau cutover. Không đổi SSH, SMTP, DataProtection hay runtime secrets.
