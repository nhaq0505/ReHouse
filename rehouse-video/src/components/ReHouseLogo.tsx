import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { REHOUSE_THEME } from '../constants/theme';

export interface ReHouseLogoProps {
  scale?: number;
  textColor?: string;
  theme?: 'dark' | 'light';
  animated?: boolean;
}

export const ReHouseLogo: React.FC<ReHouseLogoProps> = ({
  scale = 1,
  textColor,
  theme = 'dark',
  animated = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entrance = animated
    ? spring({
        frame,
        fps,
        config: { damping: 14, stiffness: 120, mass: 0.8 },
      })
    : 1;

  const glowPulse = animated
    ? interpolate(Math.sin((frame / fps) * Math.PI * 2), [-1, 1], [0.85, 1.15])
    : 1;

  const isDark = theme === 'dark';
  const resolvedTextColor = textColor ?? (isDark ? '#ffffff' : REHOUSE_THEME.ink);

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 16 * scale,
        transform: `scale(${scale * (animated ? entrance : 1)})`,
        transformOrigin: 'center center',
      }}
    >
      {/* Icon Mark */}
      <div
        style={{
          width: 52 * scale,
          height: 52 * scale,
          borderRadius: 16 * scale,
          background: `linear-gradient(135deg, ${REHOUSE_THEME.teal} 0%, ${REHOUSE_THEME.tealDark} 100%)`,
          display: 'grid',
          placeItems: 'center',
          boxShadow: `0 8px 24px rgba(16, 157, 131, ${0.35 * glowPulse})`,
          color: '#ffffff',
          flexShrink: 0,
        }}
      >
        <svg
          width={30 * scale}
          height={30 * scale}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </div>

      {/* Wordmark */}
      <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
        <div
          style={{
            fontFamily: REHOUSE_THEME.fontDisplay,
            fontSize: 32 * scale,
            fontWeight: 800,
            letterSpacing: -1 * scale,
            lineHeight: 1.1,
            color: resolvedTextColor,
          }}
        >
          <span>Re</span>
          <span style={{ color: REHOUSE_THEME.teal }}>House</span>
        </div>
        <div
          style={{
            fontFamily: REHOUSE_THEME.fontDisplay,
            fontSize: 11 * scale,
            fontWeight: 700,
            letterSpacing: 1.8 * scale,
            color: isDark ? 'rgba(233, 246, 243, 0.7)' : REHOUSE_THEME.muted,
            marginTop: 4 * scale,
            textTransform: 'uppercase',
          }}
        >
          Quản Lý Nhà Trọ Tự Động
        </div>
      </div>
    </div>
  );
};
