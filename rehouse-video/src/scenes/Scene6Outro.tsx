import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { REHOUSE_THEME } from '../constants/theme';
import { ReHouseLogo } from '../components/ReHouseLogo';
import type { SceneProps } from '../types';

export const Scene6Outro: React.FC<SceneProps> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isLandscape = layout === 'landscape';

  const entrance = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 90 },
  });

  const metricsEntrance = spring({
    frame: frame - (isLandscape ? 30 : 20),
    fps,
    config: { damping: 12, stiffness: 100 },
  });

  const ctaEntrance = spring({
    frame: frame - (isLandscape ? 70 : 50),
    fps,
    config: { damping: 12, stiffness: 110 },
  });

  const glowPulse = interpolate(
    Math.sin((frame / fps) * Math.PI * 2),
    [-1, 1],
    [0.85, 1.25]
  );

  const metrics = [
    { value: '98%', label: 'Tỷ lệ lấp đầy phòng', sub: 'Tối ưu hiệu suất cho thuê' },
    { value: '2 Giây', label: 'Tự động gạch nợ PayOS', sub: 'Không cần dò sao kê' },
    { value: '15h+', label: 'Tiết kiệm mỗi tháng', sub: 'Thảnh thơi vận hành' },
  ];

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
        textAlign: 'center',
        transform: `scale(${entrance})`,
        opacity: entrance,
      }}
    >
      {/* Background Radial Glow */}
      <div
        style={{
          position: 'absolute',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${REHOUSE_THEME.tealGlow} 0%, transparent 70%)`,
          filter: 'blur(60px)',
          transform: `scale(${glowPulse})`,
          pointerEvents: 'none',
        }}
      />

      {/* 1. Metric Cards from ReportsPage */}
      <div
        style={{
          display: 'flex',
          flexDirection: isLandscape ? 'row' : 'column',
          gap: isLandscape ? 24 : 12,
          marginBottom: isLandscape ? 40 : 24,
          transform: `scale(${metricsEntrance})`,
          opacity: metricsEntrance,
          maxWidth: isLandscape ? 1080 : 480,
          width: '90%',
        }}
      >
        {metrics.map((m, idx) => (
          <div
            key={idx}
            style={{
              flex: 1,
              backgroundColor: 'rgba(26, 62, 74, 0.75)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(16, 157, 131, 0.3)',
              borderRadius: 18,
              padding: isLandscape ? '20px 24px' : '14px 18px',
              boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontSize: isLandscape ? 36 : 26,
                fontWeight: 800,
                fontFamily: REHOUSE_THEME.fontDisplay,
                color: '#35c3a6',
                lineHeight: 1.1,
              }}
            >
              {m.value}
            </div>
            <div style={{ fontSize: isLandscape ? 14 : 12, fontWeight: 700, color: '#ffffff', marginTop: 4 }}>
              {m.label}
            </div>
            <div style={{ fontSize: 11, color: '#afc4c1', marginTop: 2 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* 2. ReHouse Centered Brand Lockup */}
      <div style={{ marginBottom: isLandscape ? 28 : 20 }}>
        <ReHouseLogo scale={isLandscape ? 1.6 : 1.2} theme="dark" animated />
      </div>

      {/* Slogan */}
      <h2
        style={{
          fontSize: isLandscape ? 48 : 30,
          fontWeight: 800,
          fontFamily: REHOUSE_THEME.fontDisplay,
          color: '#ffffff',
          margin: '0 0 16px 0',
          lineHeight: 1.2,
          maxWidth: 900,
        }}
      >
        Quản lý nhà trọ nhàn tênh —{' '}
        <span
          style={{
            background: 'linear-gradient(135deg, #35c3a6 0%, #109d83 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Tự động đối soát 100%
        </span>
      </h2>

      <p
        style={{
          fontSize: isLandscape ? 20 : 15,
          color: '#c5d7d5',
          margin: '0 0 36px 0',
          maxWidth: 640,
        }}
      >
        Giải phóng chủ trọ khỏi cộng sổ thủ công, xóa bỏ nỗi lo nợ xấu và tranh cãi cọc.
      </p>

      {/* 3. Call To Action Button */}
      <div
        style={{
          transform: `scale(${ctaEntrance})`,
          opacity: ctaEntrance,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          style={{
            backgroundColor: REHOUSE_THEME.teal,
            color: '#ffffff',
            padding: isLandscape ? '18px 48px' : '14px 32px',
            borderRadius: 99,
            fontSize: isLandscape ? 20 : 16,
            fontWeight: 800,
            fontFamily: REHOUSE_THEME.fontDisplay,
            letterSpacing: 0.5,
            boxShadow: '0 12px 36px rgba(16, 157, 131, 0.45), 0 0 0 4px rgba(53, 195, 166, 0.25)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <span>Trải Nghiệm Dùng Thử Miễn Phí</span>
          <span style={{ fontSize: 20 }}>→</span>
        </div>

        <div style={{ fontSize: 13, color: '#afc4c1', letterSpacing: 1 }}>
          WEBSITE: <strong style={{ color: '#ffffff' }}>WWW.REHOUSE.VN</strong> • HOTLINE: 1900 6868
        </div>
      </div>
    </div>
  );
};
