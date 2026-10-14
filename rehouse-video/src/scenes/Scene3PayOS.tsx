import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { REHOUSE_THEME, MOCK_INVOICE_P201 } from '../constants/theme';
import { DesktopWindow, MobilePhone } from '../components/DeviceMockup';
import { ConfettiBurst } from '../components/ConfettiBurst';
import { formatVnd } from '../components/AnimatedCounter';
import type { SceneProps } from '../types';

export const Scene3PayOS: React.FC<SceneProps> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isLandscape = layout === 'landscape';

  // Responsive relative timing
  const tScanStart = isLandscape ? 110 : 80;
  const tScanEnd = isLandscape ? 170 : 130;
  const tWebhookShoot = isLandscape ? 180 : 140;
  const tWebhookLand = isLandscape ? 250 : 200;
  const tSuccess = tWebhookLand + 10;

  // Scene entrance spring
  const entrance = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 85 },
  });

  // Laser scanner position on QR code (0% to 100%)
  const scanProgress = interpolate(frame, [tScanStart, tScanEnd], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const isScanning = frame >= tScanStart && frame <= tScanEnd + 20;

  // Webhook particle transit (from Mobile to Desktop)
  const webhookProgress = interpolate(frame, [tWebhookShoot, tWebhookLand], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const isWebhookActive = frame >= tWebhookShoot && frame <= tWebhookLand + 30;

  // Success state on Desktop and Mobile
  const isPaid = frame >= tSuccess;
  const successSpring = spring({
    frame: frame - tSuccess,
    fps,
    config: { damping: 12, stiffness: 120 },
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: REHOUSE_THEME.navyDark,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: REHOUSE_THEME.fontBody,
        transform: `scale(${entrance})`,
        opacity: entrance,
      }}
    >
      {/* Background Ambient Glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(circle at 25% 50%, rgba(16, 157, 131, 0.18), transparent 50%),
            radial-gradient(circle at 75% 50%, rgba(36, 131, 100, ${isPaid ? 0.3 : 0.08}), transparent 60%)
          `,
          pointerEvents: 'none',
        }}
      />

      {/* Top Floating Badge */}
      <div
        style={{
          position: 'absolute',
          top: isLandscape ? 32 : 50,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          backgroundColor: 'rgba(21, 52, 62, 0.85)',
          backdropFilter: 'blur(12px)',
          padding: '8px 20px',
          borderRadius: 99,
          border: `1px solid ${isPaid ? REHOUSE_THEME.teal : 'rgba(255,255,255,0.15)'}`,
          boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: isPaid ? '#27c93f' : '#ffbd2e',
            boxShadow: `0 0 10px ${isPaid ? '#27c93f' : '#ffbd2e'}`,
          }}
        />
        <span style={{ fontSize: isLandscape ? 15 : 13, fontWeight: 700, color: '#ffffff' }}>
          {isPaid
            ? '✓ Webhook PayOS đối soát thành công — Gạch nợ tự động trong 2 giây!'
            : 'Khoảnh khắc "Aha" — Quét QR thanh toán & Gạch nợ Real-time'}
        </span>
      </div>

      {/* Main Split Screen Showcase */}
      <div
        style={{
          display: 'flex',
          flexDirection: isLandscape ? 'row' : 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: isLandscape ? 60 : 32,
          width: '100%',
          maxWidth: isLandscape ? 1680 : 800,
          padding: isLandscape ? '70px 60px 40px' : '90px 24px 30px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* 1. MOBILE PHONE FRAME: Tenant Checkout Page */}
        <div style={{ flex: isLandscape ? '0 0 350px' : 'none', transform: `scale(${isLandscape ? 1 : 0.88})` }}>
          <MobilePhone width={340} height={670}>
            {/* Tenant App Header */}
            <div
              style={{
                padding: '12px 18px',
                backgroundColor: '#ffffff',
                borderBottom: `1px solid ${REHOUSE_THEME.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 8,
                    backgroundColor: REHOUSE_THEME.teal,
                    color: '#ffffff',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 13,
                    fontWeight: 800,
                  }}
                >
                  R
                </div>
                <strong style={{ fontSize: 14, color: REHOUSE_THEME.ink }}>ReHouse Tenant</strong>
              </div>
              <span style={{ fontSize: 11, color: REHOUSE_THEME.muted }}>Phòng 201</span>
            </div>

            {/* Mobile Body Content */}
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: 11, color: REHOUSE_THEME.muted, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Hóa đơn phòng tháng 10
                </span>
                <div style={{ fontSize: 24, fontWeight: 800, color: REHOUSE_THEME.ink, marginTop: 2 }}>
                  {formatVnd(MOCK_INVOICE_P201.total)}
                </div>
              </div>

              {/* QR Code Container */}
              <div
                style={{
                  backgroundColor: '#ffffff',
                  borderRadius: 20,
                  padding: 16,
                  border: `1px solid ${REHOUSE_THEME.border}`,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.04)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Simulated QR Code Vector Pattern */}
                <div
                  style={{
                    width: 170,
                    height: 170,
                    position: 'relative',
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: 12,
                    display: 'grid',
                    placeItems: 'center',
                    padding: 8,
                  }}
                >
                  <svg width="154" height="154" viewBox="0 0 100 100" fill="#15343e">
                    {/* QR Finder patterns */}
                    <rect x="5" y="5" width="26" height="26" rx="4" />
                    <rect x="9" y="9" width="18" height="18" fill="#ffffff" rx="2" />
                    <rect x="13" y="13" width="10" height="10" fill="#15343e" rx="1" />

                    <rect x="69" y="5" width="26" height="26" rx="4" />
                    <rect x="73" y="9" width="18" height="18" fill="#ffffff" rx="2" />
                    <rect x="77" y="13" width="10" height="10" fill="#15343e" rx="1" />

                    <rect x="5" y="69" width="26" height="26" rx="4" />
                    <rect x="9" y="73" width="18" height="18" fill="#ffffff" rx="2" />
                    <rect x="13" y="77" width="10" height="10" fill="#15343e" rx="1" />

                    {/* QR Data modules */}
                    <rect x="36" y="8" width="6" height="14" />
                    <rect x="46" y="8" width="16" height="6" />
                    <rect x="36" y="26" width="24" height="6" />
                    <rect x="8" y="36" width="16" height="6" />
                    <rect x="8" y="46" width="10" height="14" />
                    <rect x="22" y="54" width="8" height="6" />
                    <rect x="36" y="36" width="28" height="28" fill="#109d83" rx="4" />
                    <circle cx="50" cy="50" r="8" fill="#ffffff" />
                    <rect x="68" y="36" width="14" height="8" />
                    <rect x="86" y="36" width="6" height="16" />
                    <rect x="68" y="48" width="8" height="12" />
                    <rect x="80" y="56" width="12" height="6" />
                    <rect x="36" y="68" width="12" height="8" />
                    <rect x="52" y="68" width="16" height="6" />
                    <rect x="72" y="68" width="20" height="6" />
                    <rect x="40" y="80" width="8" height="12" />
                    <rect x="54" y="80" width="20" height="12" />
                    <rect x="78" y="80" width="14" height="14" />
                  </svg>

                  {/* Laser Scan Beam */}
                  {isScanning && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${scanProgress * 100}%`,
                        height: 3,
                        backgroundColor: '#00f5d4',
                        boxShadow: '0 0 16px 4px #00f5d4, 0 0 28px 8px rgba(0, 245, 212, 0.5)',
                        zIndex: 20,
                      }}
                    />
                  )}
                </div>

                <div style={{ marginTop: 10, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, color: REHOUSE_THEME.muted }}>Nội dung chuyển khoản PayOS:</div>
                  <strong style={{ fontSize: 13, color: REHOUSE_THEME.tealDark, letterSpacing: 0.5 }}>
                    {MOCK_INVOICE_P201.payOsAccount}
                  </strong>
                </div>
              </div>

              {/* Status Notice on Mobile */}
              <div
                style={{
                  padding: '12px 14px',
                  borderRadius: 12,
                  backgroundColor: isPaid ? '#e8f7f1' : '#fef7ec',
                  border: `1px solid ${isPaid ? '#a3e4cb' : '#fcdba8'}`,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  transform: `scale(${isPaid ? successSpring : 1})`,
                }}
              >
                <span style={{ fontSize: 20 }}>{isPaid ? '🎉' : '⏳'}</span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: isPaid ? '#248364' : '#cb8b37' }}>
                    {isPaid ? 'Đã thanh toán thành công!' : 'Đang chờ quét mã QR...'}
                  </div>
                  <div style={{ fontSize: 11, color: REHOUSE_THEME.muted }}>
                    {isPaid ? 'Hệ thống đã tự động gạch nợ' : 'Mở app ngân hàng bất kỳ để quét'}
                  </div>
                </div>
              </div>
            </div>
          </MobilePhone>
        </div>

        {/* 2. WEBHOOK SIGNAL CONNECTOR (ANIMATED LASER PULSE) */}
        {isLandscape && (
          <div
            style={{
              flex: '0 0 160px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {/* Connection Wire */}
            <div
              style={{
                width: '100%',
                height: 3,
                backgroundColor: 'rgba(255,255,255,0.12)',
                position: 'relative',
              }}
            >
              {/* Shooting Light Pulse */}
              {isWebhookActive && (
                <div
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: `${webhookProgress * 100}%`,
                    width: 18,
                    height: 11,
                    borderRadius: 6,
                    backgroundColor: '#00f5d4',
                    boxShadow: '0 0 20px 6px #00f5d4',
                    transform: 'translateX(-50%)',
                  }}
                />
              )}
            </div>

            <div
              style={{
                marginTop: 14,
                backgroundColor: 'rgba(16, 157, 131, 0.25)',
                border: '1px solid rgba(16, 157, 131, 0.4)',
                padding: '4px 12px',
                borderRadius: 99,
                fontSize: 11,
                color: '#67d7bf',
                fontWeight: 700,
                letterSpacing: 0.5,
                whiteSpace: 'nowrap',
              }}
            >
              ⚡ Webhook 2.0s
            </div>
          </div>
        )}

        {/* 3. DESKTOP WINDOW FRAME: Landlord Invoices Management */}
        <div style={{ flex: 1, width: '100%', height: isLandscape ? 580 : 380 }}>
          <DesktopWindow style={{ height: '100%' }}>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', height: '100%', backgroundColor: '#ffffff' }}>
              {/* Header Bar inside Invoices */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: REHOUSE_THEME.ink }}>
                    Danh sách hóa đơn - Tháng 10/2026
                  </h3>
                  <span style={{ fontSize: 12.5, color: REHOUSE_THEME.muted }}>
                    Tự động nhận diện thanh toán qua cổng PayOS
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      backgroundColor: REHOUSE_THEME.tealLight,
                      color: REHOUSE_THEME.tealDark,
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    Đã thu: {isPaid ? '14.500.000 ₫' : '10.592.500 ₫'}
                  </div>
                </div>
              </div>

              {/* Table Rows */}
              <div
                style={{
                  border: `1px solid ${REHOUSE_THEME.border}`,
                  borderRadius: 12,
                  overflow: 'hidden',
                  flex: 1,
                }}
              >
                {/* Table Header */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 180px 140px 140px 160px 1fr',
                    padding: '12px 16px',
                    backgroundColor: '#f8faf9',
                    borderBottom: `1px solid ${REHOUSE_THEME.border}`,
                    fontSize: 12,
                    fontWeight: 700,
                    color: REHOUSE_THEME.muted,
                  }}
                >
                  <div>PHÒNG</div>
                  <div>KHÁCH THUÊ</div>
                  <div>TỔNG TIỀN</div>
                  <div>CÒN NỢ</div>
                  <div>TRẠNG THÁI</div>
                  <div style={{ textAlign: 'right' }}>ĐỐI SOÁT</div>
                </div>

                {/* Highlight Row P.201 */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 180px 140px 140px 160px 1fr',
                    padding: '16px',
                    alignItems: 'center',
                    borderBottom: `1px solid ${REHOUSE_THEME.border}`,
                    backgroundColor: isPaid ? 'rgba(36, 131, 100, 0.08)' : '#ffffff',
                    transition: 'none',
                  }}
                >
                  <strong style={{ fontSize: 14, color: REHOUSE_THEME.ink }}>P.201</strong>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>Nguyễn Văn An</div>
                    <div style={{ fontSize: 11, color: REHOUSE_THEME.muted }}>0988 765 432</div>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 600 }}>{formatVnd(MOCK_INVOICE_P201.total)}</div>

                  {/* Remaining Debt */}
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: isPaid ? REHOUSE_THEME.green : REHOUSE_THEME.red }}>
                    {isPaid ? '0 ₫' : formatVnd(MOCK_INVOICE_P201.total)}
                  </div>

                  {/* Dynamic Status Badge */}
                  <div>
                    <span
                      style={{
                        display: 'inline-block',
                        padding: '6px 12px',
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        backgroundColor: isPaid ? '#eaf6ef' : '#fef7ec',
                        color: isPaid ? '#226747' : '#cb8b37',
                        border: `1px solid ${isPaid ? '#a3e4cb' : '#fcdba8'}`,
                        transform: `scale(${isPaid ? successSpring : 1})`,
                      }}
                    >
                      {isPaid ? '✓ ĐÃ THANH TOÁN' : '⏳ CHỜ THANH TOÁN'}
                    </span>
                  </div>

                  {/* Reconciliation Method */}
                  <div style={{ textAlign: 'right', fontSize: 12, color: REHOUSE_THEME.muted }}>
                    {isPaid ? (
                      <span style={{ color: REHOUSE_THEME.tealDark, fontWeight: 600 }}>PayOS Auto-Reconciled</span>
                    ) : (
                      'VietQR Dynamic'
                    )}
                  </div>
                </div>

                {/* Other simulated rows */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 180px 140px 140px 160px 1fr',
                    padding: '14px 16px',
                    alignItems: 'center',
                    borderBottom: `1px solid ${REHOUSE_THEME.border}`,
                    color: REHOUSE_THEME.muted,
                    fontSize: 13,
                  }}
                >
                  <strong>P.101</strong>
                  <span>Trần Minh Đức</span>
                  <span>3.680.000 ₫</span>
                  <span style={{ color: REHOUSE_THEME.green, fontWeight: 600 }}>0 ₫</span>
                  <span>
                    <span style={{ padding: '4px 8px', borderRadius: 6, backgroundColor: '#eaf6ef', color: '#226747', fontSize: 11, fontWeight: 600 }}>
                      ✓ ĐÃ THANH TOÁN
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>Chuyển khoản</span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '80px 180px 140px 140px 160px 1fr',
                    padding: '14px 16px',
                    alignItems: 'center',
                    color: REHOUSE_THEME.muted,
                    fontSize: 13,
                  }}
                >
                  <strong>P.202</strong>
                  <span>Lê Hoàng Nam</span>
                  <span>3.800.000 ₫</span>
                  <span style={{ color: REHOUSE_THEME.green, fontWeight: 600 }}>0 ₫</span>
                  <span>
                    <span style={{ padding: '4px 8px', borderRadius: 6, backgroundColor: '#eaf6ef', color: '#226747', fontSize: 11, fontWeight: 600 }}>
                      ✓ ĐÃ THANH TOÁN
                    </span>
                  </span>
                  <span style={{ textAlign: 'right' }}>PayOS QR</span>
                </div>
              </div>
            </div>
          </DesktopWindow>
        </div>
      </div>

      {/* Confetti Celebration on PayOS Confirmation */}
      <ConfettiBurst
        startFrame={tSuccess}
        originX={isLandscape ? 1200 : 540}
        originY={isLandscape ? 500 : 960}
        count={isLandscape ? 55 : 35}
      />
    </div>
  );
};
