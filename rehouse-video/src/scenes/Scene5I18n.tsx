import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { REHOUSE_THEME } from '../constants/theme';
import type { SceneProps } from '../types';

interface LangItem {
  code: string;
  label: string;
  flag: string;
  invoiceTitle: string;
  paidBadge: string;
  roomDesc: string;
  totalLabel: string;
  tenantNotice: string;
}

const LANGUAGES: LangItem[] = [
  {
    code: 'vi',
    label: 'Tiếng Việt',
    flag: '🇻🇳',
    invoiceTitle: 'Hóa đơn tiền phòng tháng 10',
    paidBadge: '✓ ĐÃ THANH TOÁN',
    roomDesc: 'Phòng 201 • Studio Ban công thoáng',
    totalLabel: 'Tổng cộng thanh toán',
    tenantNotice: 'Cảm ơn bạn đã thanh toán đúng hạn!',
  },
  {
    code: 'en',
    label: 'English',
    flag: '🇬🇧',
    invoiceTitle: 'Monthly Room Invoice - Oct',
    paidBadge: '✓ PAID IN FULL',
    roomDesc: 'Room 201 • Studio with Balcony',
    totalLabel: 'Total Payment',
    tenantNotice: 'Thank you for your timely payment!',
  },
  {
    code: 'ko',
    label: '한국어',
    flag: '🇰🇷',
    invoiceTitle: '10월 월세 및 관리비 청구서',
    paidBadge: '✓ 결제 완료',
    roomDesc: '201호 • 발코니 스튜디오 원룸',
    totalLabel: '총 결제 금액',
    tenantNotice: '정기 결제해 주셔서 감사합니다!',
  },
  {
    code: 'zh',
    label: '简体中文',
    flag: '🇨🇳',
    invoiceTitle: '10月份客房月度账单',
    paidBadge: '✓ 已全额支付',
    roomDesc: '201房 • 独立阳台精品套房',
    totalLabel: '账单总计金额',
    tenantNotice: '感谢您的准时支付！',
  },
  {
    code: 'hi',
    label: 'हिन्दी',
    flag: '🇮🇳',
    invoiceTitle: 'अक्टूबर कमरे का मासिक बिल',
    paidBadge: '✓ भुगतान सफल',
    roomDesc: 'कमरा 201 • बालकनी वाला स्टूडियो',
    totalLabel: 'कुल भुगतान राशि',
    tenantNotice: 'समय पर भुगतान के लिए धन्यवाद!',
  },
];

export const Scene5I18n: React.FC<SceneProps> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isLandscape = layout === 'landscape';

  // Responsive step duration for each language flip
  const stepFrames = isLandscape ? 55 : 35;
  const currentLangIndex = Math.min(
    LANGUAGES.length - 1,
    Math.floor(frame / stepFrames)
  );
  const currentLang = LANGUAGES[currentLangIndex];

  // Local frame within current language step for smooth 3D flip
  const stepLocalFrame = frame % stepFrames;
  const flipProgress = spring({
    frame: stepLocalFrame,
    fps,
    config: { damping: 14, stiffness: 140 },
  });

  const flipRotation = interpolate(flipProgress, [0, 1], [-90, 0]);
  const flipOpacity = interpolate(flipProgress, [0, 0.4, 1], [0, 0.8, 1]);

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
      }}
    >
      {/* Background World Map Vector Grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 50% 50%, rgba(16, 157, 131, 0.22) 0%, transparent 60%),
            linear-gradient(rgba(255, 255, 255, 0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.04) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 40px 40px, 40px 40px',
        }}
      />

      {/* Eyebrow Pill */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          backgroundColor: 'rgba(16, 157, 131, 0.2)',
          border: `1px solid ${REHOUSE_THEME.teal}`,
          padding: '6px 18px',
          borderRadius: 99,
          color: '#67d7bf',
          fontSize: isLandscape ? 14 : 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: 1.5,
          marginBottom: 16,
        }}
      >
        <span>🌐</span>
        <span>Vũ khí độc quyền cho Căn hộ Dịch vụ FDI</span>
      </div>

      {/* Main Title */}
      <h2
        style={{
          fontSize: isLandscape ? 44 : 28,
          fontWeight: 800,
          fontFamily: REHOUSE_THEME.fontDisplay,
          color: '#ffffff',
          margin: '0 0 32px 0',
          textAlign: 'center',
          lineHeight: 1.2,
        }}
      >
        Hỗ trợ chuẩn 5 Ngôn Ngữ Quốc Tế
      </h2>

      {/* Language Selector Pills Bar */}
      <div
        style={{
          display: 'flex',
          gap: isLandscape ? 14 : 8,
          marginBottom: 36,
          backgroundColor: 'rgba(21, 52, 62, 0.8)',
          padding: '8px 12px',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        {LANGUAGES.map((item, idx) => {
          const isCurrent = idx === currentLangIndex;
          return (
            <div
              key={item.code}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: isLandscape ? '10px 18px' : '6px 10px',
                borderRadius: 10,
                backgroundColor: isCurrent ? REHOUSE_THEME.teal : 'transparent',
                color: '#ffffff',
                fontWeight: isCurrent ? 700 : 500,
                fontSize: isLandscape ? 14 : 12,
                boxShadow: isCurrent ? '0 4px 16px rgba(16, 157, 131, 0.4)' : 'none',
                transform: `scale(${isCurrent ? 1.05 : 1})`,
              }}
            >
              <span style={{ fontSize: isLandscape ? 18 : 15 }}>{item.flag}</span>
              <span>{item.label}</span>
            </div>
          );
        })}
      </div>

      {/* Morphing Invoice Card (3D Flip Animation) */}
      <div
        style={{
          perspective: 1200,
          width: isLandscape ? 620 : '90%',
        }}
      >
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: 24,
            boxShadow: '0 24px 60px rgba(0, 0, 0, 0.35)',
            border: `1px solid ${REHOUSE_THEME.border}`,
            padding: isLandscape ? '32px 36px' : '22px 24px',
            transform: `rotateX(${flipRotation}deg)`,
            opacity: flipOpacity,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
          }}
        >
          {/* Header of Invoice Card */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: 12, color: REHOUSE_THEME.tealDark, fontWeight: 700, textTransform: 'uppercase' }}>
                ReHouse Global Tenant Portal
              </div>
              <h3 style={{ margin: '4px 0 0 0', fontSize: isLandscape ? 22 : 18, fontWeight: 700, color: REHOUSE_THEME.ink }}>
                {currentLang.invoiceTitle}
              </h3>
              <div style={{ fontSize: 13, color: REHOUSE_THEME.muted, marginTop: 3 }}>
                {currentLang.roomDesc}
              </div>
            </div>

            <span
              style={{
                padding: '6px 12px',
                borderRadius: 8,
                backgroundColor: '#eaf6ef',
                color: '#226747',
                fontSize: 12.5,
                fontWeight: 700,
                border: '1px solid #a3e4cb',
              }}
            >
              {currentLang.paidBadge}
            </span>
          </div>

          <div style={{ height: 1, backgroundColor: REHOUSE_THEME.border }} />

          {/* Amount and Notice */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <span style={{ fontSize: 12, color: REHOUSE_THEME.muted, textTransform: 'uppercase' }}>
                {currentLang.totalLabel}
              </span>
              <div
                style={{
                  fontSize: isLandscape ? 30 : 24,
                  fontWeight: 800,
                  fontFamily: REHOUSE_THEME.fontDisplay,
                  color: REHOUSE_THEME.tealDark,
                }}
              >
                3.907.500 ₫
              </div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 12, color: '#248364', fontWeight: 600, display: 'block' }}>
                {currentLang.tenantNotice}
              </span>
              <span style={{ fontSize: 11, color: REHOUSE_THEME.muted }}>
                VietQR • MoMo • Apple Pay
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
