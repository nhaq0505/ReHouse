# 🎬 ReHouse Motion Graphics & SaaS Promo Video (Remotion)

Video quảng cáo sản phẩm SaaS chuyên nghiệp cho phần mềm quản lý phòng trọ **ReHouse**, được xây dựng hoàn toàn bằng **Remotion (React + TypeScript)** với đầy đủ hệ thống **Nhạc nền BGM** và **Hiệu ứng âm thanh SFX** đồng bộ chính xác từng frame.

---

## 📐 Thông Số Kỹ Thuật (Remotion Compositions)

1. **`ReHouseLaunchLandscape`**:
   - Độ phân giải: **1920x1080** (Chuẩn 16:9 Full HD)
   - Tốc độ khung hình: **60 fps**
   - Thời lượng: **45 giây** (2700 frames)
   - Mục đích: Trình chiếu trên Website / Landing Page / YouTube Promo.

2. **`ReHouseTikTokVertical`**:
   - Độ phân giải: **1080x1920** (Chuẩn 9:16 dọc)
   - Tốc độ khung hình: **60 fps**
   - Thời lượng: **30 giây** (1800 frames)
   - Mục đích: Quảng cáo trên TikTok / Facebook Reels / YouTube Shorts.

---

## 🎵 Hệ Thống Nhạc Nền (BGM) & SFX Tự Động Thuần Node.js

Hệ thống âm thanh được sinh tự động bằng script `scripts/generate-audio.mjs` sử dụng Node.js Buffer / 16-bit PCM Stereo thuần túy (không cần cài thêm phần mềm hay ffmpeg):
- `bgm.wav`: Bản nhạc Modern Upbeat Tech SaaS Synth 120 BPM, tiến trình hợp âm tươi sáng (C - G - Am - F) kéo dài 46s, loopable mượt mà. Âm lượng tự động fade-in trong 1 giây đầu (0 -> 0.28) và fade-out ở 1.5 giây cuối (0.28 -> 0).
- `whoosh.wav`: Tiếng chuyển cảnh mượt mà giữa các Scene (swept bandpass filter).
- `pop.wav`: Tiếng nảy nhẹ UI khi các thẻ phòng hoặc thông báo nảy lên (bouncy bubble pop).
- `qr-beep.wav`: Tiếng quét mã QR PayOS công nghệ cao (2-tone confirmation beep).
- `cash-success.wav`: Tiếng chuông Crystal Chime C-major 9 ngân vang khi Webhook PayOS gạch nợ thành công sang *"Đã thanh toán"*.

> **Tự động kích hoạt**: Script tạo âm thanh được gắn sẵn trong `predev` và `prebuild` của `package.json`, đảm bảo không bao giờ bị lỗi thiếu file audio khi render.

---

## 🎞️ Cấu Trúc Storyboard (6 Phân Cảnh)

1. **Scene 1: The Hook — Nỗi đau của Chủ Trọ (Frame 0 - 300 | 0s - 5s)**
   - Kinetic Typography kết hợp 3 thẻ vấn đề nhức nhối nảy lên với spring physics: *Cộng sổ tay điện nước sai lệch*, *Chờ khách chụp bill chuyển khoản giả mạo*, *Tranh cãi cọc khi trả phòng*.
   - Zoom-through mở ra giải pháp ReHouse: *"Tự động hóa vận hành nhà trọ chỉ với 1 chạm"*.
2. **Scene 2: Chốt Điện Nước & Xuất Hóa Đơn Siêu Tốc (Frame 300 - 900 | 5s - 15s)**
   - Tái hiện `ReadingsPage.tsx` và `RoomsPage.tsx` với Room Cards theo đúng bảng màu `roomTheme.ts`.
   - Animated Number Counter nhảy số điện cũ -> mới và tự động tính tiền điện nước. Hóa đơn `InvoicesPage.tsx` lập tức xuất hiện với tổng tiền đếm từ 0đ -> 3.907.500đ.
3. **Scene 3: Khoảnh Khắc "Aha" — QR PayOS & Gạch Nợ 2 Giây (Frame 900 - 1620 | 15s - 27s)**
   - Chia đôi màn hình (Mobile phone frame bên trái và Desktop window bên phải).
   - Tia laser quét qua mã QR VietQR PayOS (`qr-beep.wav`) -> Tia sóng Webhook `PaymentWebhookService` bắn từ Mobile sang Desktop -> Trạng thái hóa đơn nhảy spring sang **"ĐÃ THANH TOÁN (PAID)"** kèm chuông `cash-success.wav` và pháo giấy confetti bung nở.
4. **Scene 4: Quản Lý Tiền Cọc & Tất Toán Trả Phòng (Frame 1620 - 2160 | 27s - 36s)**
   - Ngăn kéo `MoveoutDrawer.tsx` trượt vào kết hợp bảng `DepositLedger.tsx`.
   - Phép tính khấu trừ tự động: Tiền cọc gốc 5.000.000đ trừ điện nước tháng cuối và phí vệ sinh -> Ra số tiền hoàn cọc chính xác 4.150.000đ, minh bạch 100%.
5. **Scene 5: Vũ Khí Ngách — Đa Ngôn Ngữ FDI (Frame 2160 - 2460 | 36s - 41s)**
   - Lật thẻ 3D qua 5 thứ tiếng: Tiếng Việt 🇻🇳, English 🇬🇧, 한국어 🇰🇷, 简体中文 🇨🇳, हिन्दी 🇮🇳 lấy trực tiếp từ dữ liệu i18n của hệ thống.
6. **Scene 6: Outro & Call To Action (Frame 2460 - 2700 | 41s - 45s)**
   - Số liệu ấn tượng từ `ReportsPage.tsx` (98% lấp đầy, gạch nợ 2s, tiết kiệm 15h/tháng).
   - Logo ReHouse tỏa sáng cùng slogan *"Quản lý nhà trọ nhàn tênh — Tự động đối soát 100%"* và nút CTA kêu gọi đăng ký dùng thử.

---

## 🚀 Hướng Dẫn Sử Dụng

### 1. Mở Remotion Studio (Xem trước & Tinh chỉnh tương tác trực tiếp)
```bash
cd rehouse-video
npm run dev
```
Trình duyệt sẽ tự động mở giao diện Remotion Studio tại `http://localhost:3000` cho phép bạn tua từng frame, xem trước âm thanh và tùy biến tham số.

### 2. Xuất Video MP4 (Render)

- **Xuất video 16:9 Landscape (45s cho YouTube / Landing Page)**:
  ```bash
  npm run build
  ```
  File thành phẩm sẽ được lưu tại: `rehouse-video/out/rehouse-launch.mp4`.

- **Xuất video 9:16 Vertical (30s cho TikTok / Reels / Shorts)**:
  ```bash
  npm run build:vertical
  ```
  File thành phẩm sẽ được lưu tại: `rehouse-video/out/rehouse-tiktok.mp4`.

- **Kiểm tra kiểu dữ liệu TypeScript**:
  ```bash
  npm run typecheck
  ```

- **Tạo lại toàn bộ file âm thanh WAV**:
  ```bash
  npm run generate-audio
  ```
