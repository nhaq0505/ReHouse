import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { REHOUSE_THEME } from '../constants/theme';
import { ReHouseLogo } from '../components/ReHouseLogo';
import type { SceneProps } from '../types';

export const Scene1Hook: React.FC<SceneProps> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isLandscape = layout === 'landscape';

  // Responsive timing
  const tPop1 = isLandscape ? 20 : 15;
  const tPop2 = isLandscape ? 60 : 45;
  const tPop3 = isLandscape ? 100 : 75;
  const tBreakthrough = isLandscape ? 180 : 140;

  // Spring animations for 3 pain point cards
  const spring1 = spring({ frame: frame - tPop1, fps, config: { damping: 12, stiffness: 100 } });
  const spring2 = spring({ frame: frame - tPop2, fps, config: { damping: 12, stiffness: 100 } });
  const spring3 = spring({ frame: frame - tPop3, fps, config: { damping: 12, stiffness: 100 } });

  // Breakthrough transition to ReHouse solution
  const zoomProgress = interpolate(frame, [tBreakthrough, tBreakthrough + 45], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const cardsScale = interpolate(zoomProgress, [0, 1], [1, 2.6]);
  const cardsOpacity = interpolate(zoomProgress, [0, 0.7], [1, 0]);

  // Solution entrance
  const solutionEntrance = spring({
    frame: frame - (tBreakthrough + 20),
    fps,
    config: { damping: 14, stiffness: 110 },
  });

  const painPoints = [
    {
      icon: '📝',
      title: 'Cuối tháng cộng sổ tay điện nước?',
      desc: 'Mất cả ngày bấm máy tính, dễ nhầm lẫn số điện số nước, khách khiếu nại.',
      badge: 'Tốn 15h mỗi tháng',
      spring: spring1,
      visible: frame >= tPop1,
    },
    {
      icon: '⏳',
      title: 'Chờ khách chụp màn hình bill?',
      desc: 'Dò từng giao dịch ngân hàng thủ công, nơm nớp lo sợ bill giả mạo photoshop.',
      badge: 'Rủi ro thất thoát tiền',
      spring: spring2,
      visible: frame >= tPop2,
    },
    {
      icon: '⚠️',
      title: 'Tranh cãi tiền cọc khi trả phòng?',
      desc: 'Không có sổ cái minh bạch lưu vết chi phí hư hỏng và công nợ tồn đọng.',
      badge: 'Mất uy tín chủ trọ',
      spring: spring3,
      visible: frame >= tPop3,
    },
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
      }}
    >
      {/* Background Cyber Grid & Ambient Glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `
            radial-gradient(circle at 50% 30%, rgba(201, 88, 84, ${0.15 * (1 - zoomProgress)}), transparent 60%),
            radial-gradient(circle at 50% 70%, rgba(16, 157, 131, ${0.25 * zoomProgress}), transparent 70%),
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px)
          `,
          backgroundSize: '100% 100%, 100% 100%, 48px 48px, 48px 48px',
          opacity: 0.8,
        }}
      />

      {/* PHASE A: THE PAIN POINTS (0 - Breakthrough) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${cardsScale})`,
          opacity: cardsOpacity,
          padding: isLandscape ? '0 80px' : '0 40px',
        }}
      >
        {/* Subtitle / Eyebrow */}
        <div
          style={{
            fontSize: isLandscape ? 16 : 14,
            fontWeight: 700,
            letterSpacing: 3,
            color: '#ff8a80',
            textTransform: 'uppercase',
            marginBottom: 16,
            backgroundColor: 'rgba(201, 88, 84, 0.15)',
            border: '1px solid rgba(201, 88, 84, 0.3)',
            padding: '6px 18px',
            borderRadius: 99,
          }}
        >
          Nỗi ám ảnh của Chủ Trọ
        </div>

        {/* Big Hook Title */}
        <h1
          style={{
            fontSize: isLandscape ? 52 : 36,
            fontWeight: 800,
            fontFamily: REHOUSE_THEME.fontDisplay,
            color: '#ffffff',
            textAlign: 'center',
            margin: '0 0 48px 0',
            lineHeight: 1.2,
            maxWidth: isLandscape ? 1100 : 700,
          }}
        >
          Bạn vẫn đang quản lý nhà trọ theo cách <span style={{ color: '#ff6b6b' }}>thủ công?</span>
        </h1>

        {/* 3 Pain Point Cards */}
        <div
          style={{
            display: 'flex',
            flexDirection: isLandscape ? 'row' : 'column',
            gap: isLandscape ? 28 : 18,
            width: '100%',
            maxWidth: isLandscape ? 1280 : 540,
            justifyContent: 'center',
          }}
        >
          {painPoints.map((p, idx) => {
            if (!p.visible) return null;
            // Slight tilt angle for natural tension
            const tilt = (idx - 1) * 1.5;
            const translateY = (1 - p.spring) * 80;

            return (
              <div
                key={idx}
                style={{
                  flex: 1,
                  backgroundColor: 'rgba(26, 62, 74, 0.85)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: 20,
                  border: '1px solid rgba(201, 88, 84, 0.4)',
                  boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
                  padding: isLandscape ? '28px 26px' : '20px 22px',
                  display: 'flex',
                  flexDirection: 'column',
                  transform: `translateY(${translateY}px) rotate(${tilt}deg) scale(${p.spring})`,
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      backgroundColor: 'rgba(201, 88, 84, 0.2)',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 24,
                    }}
                  >
                    {p.icon}
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: '#ff8a80',
                      backgroundColor: 'rgba(201, 88, 84, 0.2)',
                      padding: '4px 10px',
                      borderRadius: 6,
                    }}
                  >
                    {p.badge}
                  </span>
                </div>

                <h3
                  style={{
                    fontSize: isLandscape ? 20 : 17,
                    fontWeight: 700,
                    color: '#ffffff',
                    margin: '0 0 10px 0',
                    lineHeight: 1.3,
                  }}
                >
                  {p.title}
                </h3>

                <p
                  style={{
                    fontSize: isLandscape ? 14 : 12.5,
                    color: '#c5d7d5',
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {p.desc}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* PHASE B: THE SOLUTION BREAKTHROUGH (Breakthrough -> End) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${solutionEntrance})`,
          opacity: frame >= tBreakthrough ? solutionEntrance : 0,
          pointerEvents: frame >= tBreakthrough ? 'auto' : 'none',
          padding: '0 40px',
          textAlign: 'center',
        }}
      >
          {/* Glowing Aura Ring */}
          <div
            style={{
              position: 'absolute',
              width: 600,
              height: 600,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${REHOUSE_THEME.tealGlow} 0%, transparent 70%)`,
              pointerEvents: 'none',
              filter: 'blur(40px)',
            }}
          />

          <ReHouseLogo scale={isLandscape ? 1.4 : 1.1} theme="dark" animated />

          <div
            style={{
              marginTop: 32,
              padding: '8px 24px',
              borderRadius: 99,
              backgroundColor: 'rgba(16, 157, 131, 0.2)',
              border: `1px solid ${REHOUSE_THEME.teal}`,
              color: '#67d7bf',
              fontSize: isLandscape ? 16 : 13,
              fontWeight: 700,
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Giải pháp công nghệ đột phá
          </div>

          <h2
            style={{
              fontSize: isLandscape ? 56 : 38,
              fontWeight: 800,
              fontFamily: REHOUSE_THEME.fontDisplay,
              color: '#ffffff',
              margin: '20px 0 16px 0',
              lineHeight: 1.15,
              maxWidth: 960,
            }}
          >
            Tự động hóa vận hành nhà trọ{' '}
            <span
              style={{
                background: `linear-gradient(135deg, #35c3a6 0%, #109d83 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              chỉ với 1 chạm
            </span>
          </h2>

          <p
            style={{
              fontSize: isLandscape ? 22 : 16,
              color: '#c5d7d5',
              maxWidth: 720,
              margin: 0,
              lineHeight: 1.6,
            }}
          >
            Ghi số điện thông minh • Thanh toán QR PayOS gạch nợ tự động • Sổ cọc minh bạch
          </p>
        </div>
    </div>
  );
};
