import { Link } from 'react-router-dom';
import {
  ArrowRightOutlined,
  BarChartOutlined,
  CheckCircleFilled,
  CreditCardOutlined,
  DashboardOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  HomeOutlined,
  LockOutlined,
  QrcodeOutlined,
  SafetyCertificateOutlined,
  SendOutlined,
  TeamOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import RoomieMark from '../components/RoomieMark';
import LanguageSelector from '../i18n/LanguageSelector';
import { t } from '../i18n/runtime';
import { useAuth } from '../auth';
import { formatVnd } from '../api';
import './LandingPage.css';

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="landing-page">
      {/* a) Sticky Header */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link to="/" className="landing-brand" aria-label="Rehouse">
            <div className="brand-mark">
              <RoomieMark />
            </div>
            <div className="landing-brand-text">
              <strong>Rehouse</strong>
              <span>{t("QUẢN LÝ PHÒNG TRỌ")}</span>
            </div>
          </Link>

          <div className="landing-header-actions">
            <LanguageSelector />
            {user && (
              <Link
                to={user.role === 'Admin' ? '/admin/owners' : '/dashboard'}
                className="landing-btn landing-btn-ghost"
              >
                <DashboardOutlined /> {t("Bảng điều khiển")}
              </Link>
            )}
            <Link to="/login" className="landing-btn landing-btn-outline">
              {t("Đăng nhập")}
            </Link>
            <Link to="/register" className="landing-btn landing-btn-primary">
              <span className="btn-text-full">{t("Đăng ký làm chủ trọ")}</span>
              <span className="btn-text-short">{t("Đăng ký")}</span>
            </Link>
          </div>
        </div>
      </header>

      {/* b) Hero Section 2 Columns */}
      <section className="landing-hero" id="hero">
        <div className="hero-grid">
          {/* Left Column: Core message, CTAs, 3 Key Benefits */}
          <div className="hero-content">
            <div className="hero-kicker">
              <SafetyCertificateOutlined /> {t("GIẢI PHÁP QUẢN LÝ NHÀ TRỌ TOÀN DIỆN")}
            </div>
            <h1 className="hero-title">
              {t("Quản lý phòng trọ thông minh,")}<br />
              <span className="text-teal">{t("nhẹ đầu hơn mỗi tháng.")}</span>
            </h1>
            <p className="hero-subtitle">
              {t("Theo dõi người thuê, chốt chỉ số điện và gửi hóa đơn trong một nơi duy nhất.")}
            </p>

            <div className="hero-actions">
              <Link to="/register" className="landing-btn landing-btn-primary landing-btn-lg">
                {t("Đăng ký làm chủ trọ")} <ArrowRightOutlined />
              </Link>
              <Link to="/login" className="landing-btn landing-btn-outline landing-btn-lg">
                {t("Đăng nhập")}
              </Link>
            </div>

            <div className="hero-highlights">
              <div className="highlight-item">
                <CheckCircleFilled className="highlight-icon" />
                <span>{t("Tự động hóa chốt điện & phát hành hóa đơn chỉ với 1 cú chạm")}</span>
              </div>
              <div className="highlight-item">
                <CheckCircleFilled className="highlight-icon" />
                <span>{t("Thanh toán trực tuyến tức thì qua QR payOS, đối soát tự động")}</span>
              </div>
              <div className="highlight-item">
                <CheckCircleFilled className="highlight-icon" />
                <span>{t("Người thuê tự xem hóa đơn bằng liên kết riêng, không cần cài app")}</span>
              </div>
            </div>
          </div>

          {/* Right Column: HTML/CSS Mockups (Stat Card, Invoice P101, payOS Chip) */}
          <div className="hero-mockup-wrapper">
            <div className="mockup-backdrop-glow" />

            {/* Mockup 1: Stat Card */}
            <div className="mockup-stat-card">
              <div className="mockup-card-header">
                <div className="mockup-card-title">
                  <HomeOutlined />
                  <span>{t("Tình hình phòng trọ")}</span>
                </div>
                <div className="mockup-badge-active">
                  <span className="pulse-dot" />
                  <span>{t("Đang hoạt động")}</span>
                </div>
              </div>

              <div className="mockup-stats-grid">
                <div className="mockup-stat-cell">
                  <small>{t("Tổng số phòng")}</small>
                  <strong>12</strong>
                </div>
                <div className="mockup-stat-cell">
                  <small>{t("Đang thuê")}</small>
                  <strong>11</strong>
                </div>
                <div className="mockup-stat-cell">
                  <small>{t("Phòng trống")}</small>
                  <strong>1</strong>
                </div>
                <div className="mockup-stat-cell">
                  <small>{t("Tỷ lệ lấp đầy")}</small>
                  <strong>92%</strong>
                </div>
              </div>

              <div className="mockup-stat-footer">
                <div className="revenue-label">
                  <span>{t("Doanh thu tháng")}</span>
                  <strong>{formatVnd(42500000)}</strong>
                </div>
                <div className="revenue-bar-track">
                  <div className="revenue-bar-fill" />
                </div>
              </div>
            </div>

            {/* Mockup 2: Sample Invoice P101 */}
            <div className="mockup-invoice-card">
              <div className="invoice-card-header">
                <div className="invoice-room-pill">
                  P101 <span>• {t("Dãy trọ")} A</span>
                </div>
                <span className="invoice-badge-paid">
                  ✓ {t("Đã thanh toán")}
                </span>
              </div>

              <div className="invoice-items-table">
                <div className="invoice-row">
                  <span>{t("Tiền thuê")} (10/2026)</span>
                  <span>{formatVnd(3500000)}</span>
                </div>
                <div className="invoice-row">
                  <span>{t("Tiền điện")} (124 kWh x 3.500)</span>
                  <span>{formatVnd(434000)}</span>
                </div>
                <div className="invoice-row">
                  <span>{t("Tiền nước")} (1 {t("Phòng")})</span>
                  <span>{formatVnd(100000)}</span>
                </div>
                <div className="invoice-row">
                  <span>{t("Phí dịch vụ")} (Wifi &amp; Internet)</span>
                  <span>{formatVnd(50000)}</span>
                </div>
                <div className="invoice-row total-row">
                  <span>{t("Tổng cộng:")}</span>
                  <span>{formatVnd(4084000)}</span>
                </div>
              </div>
            </div>

            {/* Mockup 3: Chip QR payOS */}
            <div className="mockup-payos-chip">
              <div className="payos-qr-preview">
                <svg viewBox="0 0 24 24" fill="none" stroke="#15343e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" />
                  <rect x="14" y="3" width="7" height="7" />
                  <rect x="3" y="14" width="7" height="7" />
                  <rect x="7" y="7" width="0.1" height="0.1" strokeWidth="3" />
                  <rect x="17" y="7" width="0.1" height="0.1" strokeWidth="3" />
                  <rect x="7" y="17" width="0.1" height="0.1" strokeWidth="3" />
                  <path d="M14 14h3v3h-3zM17 17h4v4h-4zM14 20h3v1h-3z" />
                </svg>
              </div>
              <div className="payos-chip-text">
                <div className="payos-brand-row">
                  <span className="payos-brand-tag">payOS</span>
                  <small>VietQR 24/7</small>
                </div>
                <strong>{t("Quét mã thanh toán tức thì")}</strong>
                <small>{t("Tự động gạch nợ sau 3 giây")}</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* c) Lưới 6 tính năng chính */}
      <section className="landing-section" id="features">
        <div className="section-header">
          <span className="section-eyebrow">{t("TÍNH NĂNG NỔI BẬT")}</span>
          <h2 className="section-title">{t("Mọi công cụ bạn cần để vận hành trơn tru")}</h2>
          <p className="section-subtitle">
            {t("Đơn giản hóa việc quản lý mỗi ngày")}
          </p>
        </div>

        <div className="features-grid">
          {/* Feature 1 */}
          <div className="feature-card">
            <div className="feature-icon-wrap">
              <HomeOutlined />
            </div>
            <h3>{t("Dãy trọ")}</h3>
            <p>
              {t("Quản lý linh hoạt nhiều dãy trọ, phân nhóm phòng và thiết lập đơn giá dịch vụ riêng cho từng khu vực.")}
            </p>
          </div>

          {/* Feature 2 */}
          <div className="feature-card">
            <div className="feature-icon-wrap">
              <TeamOutlined />
            </div>
            <h3>{t("Phòng & người thuê")}</h3>
            <p>
              {t("Theo dõi tình trạng trống, thông tin khách thuê, số lượng thành viên và tiền cọc giữ chỗ minh bạch.")}
            </p>
          </div>

          {/* Feature 3 */}
          <div className="feature-card">
            <div className="feature-icon-wrap">
              <ThunderboltOutlined />
            </div>
            <h3>{t("Chỉ số điện")}</h3>
            <p>
              {t("Ghi chỉ số điện hàng tháng nhanh gọn, tự động kiểm tra số hợp lệ, chống sai sót và ngăn chỉ số giảm.")}
            </p>
          </div>

          {/* Feature 4 */}
          <div className="feature-card">
            <div className="feature-icon-wrap">
              <FileTextOutlined />
            </div>
            <h3>{t("Hóa đơn")}</h3>
            <p>
              {t("Tự động tính tiền điện, nước, phòng và phát hành hóa đơn minh bạch, gửi đến từng người thuê chỉ trong vài giây.")}
            </p>
          </div>

          {/* Feature 5 */}
          <div className="feature-card">
            <div className="feature-icon-wrap">
              <CreditCardOutlined />
            </div>
            <h3>{t("Thanh toán trực tuyến (payOS)")}</h3>
            <p>
              {t("Tích hợp cổng payOS, thanh toán qua mã VietQR, tiền về thẳng tài khoản chủ trọ và tự động cập nhật trạng thái.")}
            </p>
          </div>

          {/* Feature 6 */}
          <div className="feature-card">
            <div className="feature-icon-wrap">
              <BarChartOutlined />
            </div>
            <h3>{t("Báo cáo & Đối soát")}</h3>
            <p>
              {t("Theo dõi doanh thu, công nợ và tiền cọc theo thời gian thực. Đối soát chi tiết và xuất báo cáo Excel tiện lợi.")}
            </p>
          </div>
        </div>
      </section>

      {/* d) Cách hoạt động (3 bước) kết hợp thẻ "Bảo mật giao dịch" */}
      <section className="landing-section" id="how-it-works">
        <div className="section-header">
          <span className="section-eyebrow">{t("CÁCH HOẠT ĐỘNG")}</span>
          <h2 className="section-title">{t("Tiện lợi cho khách, nhàn hạ cho chủ trọ")}</h2>
          <p className="section-subtitle">
            {t("TRẢI NGHIỆM KHÁCH THUÊ")}
          </p>
        </div>

        <div className="how-it-works-steps">
          {/* Step 1 */}
          <div className="step-card">
            <div className="step-header">
              <span className="step-number">01</span>
              <SendOutlined className="step-icon" />
            </div>
            <h3>{t("Nhận liên kết riêng tư")}</h3>
            <p>
              {t("Mỗi lượt thuê có một liên kết bảo mật duy nhất, khách thuê mở trực tiếp trên điện thoại mà không cần tải ứng dụng.")}
            </p>
          </div>

          {/* Step 2 */}
          <div className="step-card">
            <div className="step-header">
              <span className="step-number">02</span>
              <FileSearchOutlined className="step-icon" />
            </div>
            <h3>{t("Xem hóa đơn minh bạch")}</h3>
            <p>
              {t("Khách chủ động kiểm tra chi tiết tiền phòng, chỉ số điện nước kèm ảnh đồng hồ và các khoản phí dịch vụ rõ ràng.")}
            </p>
          </div>

          {/* Step 3 */}
          <div className="step-card">
            <div className="step-header">
              <span className="step-number">03</span>
              <QrcodeOutlined className="step-icon" />
            </div>
            <h3>{t("Thanh toán quét mã QR tức thì")}</h3>
            <p>
              {t("Chỉ cần một lần quét mã VietQR trên bất kỳ ứng dụng ngân hàng nào, hóa đơn được tự động gạch nợ ngay lập tức.")}
            </p>
          </div>
        </div>

        {/* Thẻ Bảo mật giao dịch */}
        <div className="security-card">
          <div className="security-left">
            <SafetyCertificateOutlined className="security-icon-large" />
            <h3>{t("Bảo mật giao dịch")}</h3>
            <p>
              {t("Thông tin kết nối được mã hóa ở phía máy chủ. Roomie không lưu số thẻ hoặc thông tin ngân hàng của người thuê.")}
            </p>
          </div>
          <div className="security-list">
            <div className="security-list-item">
              <LockOutlined className="check-icon" />
              <span>{t("Mã hóa đầu cuối: Thông tin thanh toán và khóa tích hợp được mã hóa an toàn trên máy chủ.")}</span>
            </div>
            <div className="security-list-item">
              <CheckCircleFilled className="check-icon" />
              <span>{t("Webhook đối soát máy chủ: Chỉ xác nhận thanh toán khi có chữ ký bảo mật từ payOS, không phụ thuộc trình duyệt.")}</span>
            </div>
            <div className="security-list-item">
              <SafetyCertificateOutlined className="check-icon" />
              <span>{t("Thu hồi tự động khi trả phòng: Khi khách chuyển đi, liên kết bị vô hiệu hóa ngay, bảo vệ dữ liệu khách mới.")}</span>
            </div>
          </div>
        </div>
      </section>

      {/* e) Banner CTA cuối trang: 3 bước tạo tài khoản chủ trọ */}
      <div className="landing-cta-wrapper">
        <section className="landing-cta-banner">
          <div className="cta-banner-inner">
            <h2>{t("Bắt đầu quản lý dãy trọ chuyên nghiệp ngay hôm nay")}</h2>
            <p>{t("Đăng ký, xác nhận email và bắt đầu quản lý nhà trọ với gói Miễn phí.")}</p>

            <div className="cta-steps-grid">
              <div className="cta-step-card">
                <strong>{t("1. Đăng ký thông tin")}</strong>
                <span>{t("Điền họ tên, email và mật khẩu trong 30 giây.")}</span>
              </div>
              <div className="cta-step-card">
                <strong>{t("2. Xác thực OTP email")}</strong>
                <span>{t("Nhập mã xác thực gửi về hòm thư để kích hoạt tài khoản an toàn.")}</span>
              </div>
              <div className="cta-step-card">
                <strong>{t("3. Thiết lập phòng & đón khách")}</strong>
                <span>{t("Tạo dãy trọ đầu tiên và trải nghiệm cách quản lý thảnh thơi.")}</span>
              </div>
            </div>

            <div className="cta-button-wrap">
              <Link to="/register" className="landing-btn landing-btn-primary landing-btn-lg">
                {t("Đăng ký làm chủ trọ ngay")} <ArrowRightOutlined />
              </Link>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-inner">
          <div className="footer-brand-col">
            <div className="landing-brand">
              <div className="brand-mark">
                <RoomieMark />
              </div>
              <div className="landing-brand-text">
                <strong>Rehouse</strong>
                <span>{t("QUẢN LÝ PHÒNG TRỌ")}</span>
              </div>
            </div>
            <p>{t("Đơn giản hóa việc quản lý nhà trọ mỗi ngày.")}</p>
          </div>

          <div className="footer-links-col">
            <h4>{t("Tính năng")}</h4>
            <ul className="footer-nav-list">
              <li><a href="#hero">{t("Trang chủ")}</a></li>
              <li><a href="#features">{t("Tính năng")}</a></li>
              <li><a href="#how-it-works">{t("Cách hoạt động")}</a></li>
            </ul>
          </div>

          <div className="footer-links-col">
            <h4>{t("Chủ trọ")}</h4>
            <ul className="footer-nav-list">
              <li><Link to="/login">{t("Đăng nhập")}</Link></li>
              <li><Link to="/register">{t("Đăng ký làm chủ trọ")}</Link></li>
              <li><Link to="/welcome">{t("Trang chủ")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>&copy; 2026 Rehouse. All rights reserved.</span>
          <span>{t("Đơn giản hóa việc quản lý mỗi ngày")}</span>
        </div>
      </footer>
    </div>
  );
}
