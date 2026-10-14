import React from 'react';
import { REHOUSE_THEME } from '../constants/theme';

export const DesktopWindow: React.FC<{
  title?: string;
  width?: number | string;
  height?: number | string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ title = 'ReHouse - Quản Lý Hóa Đơn & Đối Soát', width = '100%', height = '100%', children, style }) => {
  return (
    <div
      style={{
        width,
        height,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        boxShadow: '0 24px 60px rgba(21, 52, 62, 0.22), 0 4px 16px rgba(0,0,0,0.06)',
        border: `1px solid ${REHOUSE_THEME.border}`,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {/* Window Title Bar */}
      <div
        style={{
          height: 44,
          backgroundColor: '#f8faf9',
          borderBottom: `1px solid ${REHOUSE_THEME.border}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 16px',
          gap: 12,
          flexShrink: 0,
        }}
      >
        {/* macOS Traffic Lights */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: '#ff5f56' }} />
          <div style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
          <div style={{ width: 11, height: 11, borderRadius: '50%', backgroundColor: '#27c93f' }} />
        </div>

        {/* URL / Title bar pill */}
        <div
          style={{
            flex: 1,
            maxWidth: 480,
            margin: '0 auto',
            height: 28,
            backgroundColor: '#ffffff',
            borderRadius: 6,
            border: `1px solid ${REHOUSE_THEME.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 12px',
            fontSize: 12,
            fontFamily: REHOUSE_THEME.fontBody,
            color: REHOUSE_THEME.muted,
            gap: 6,
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>https://app.rehouse.vn/invoices</span>
        </div>

        <div style={{ width: 48 }} />
      </div>

      {/* Window Body */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
};

export const MobilePhone: React.FC<{
  width?: number;
  height?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ width = 360, height = 720, children, style }) => {
  return (
    <div
      style={{
        width,
        height,
        backgroundColor: '#ffffff',
        borderRadius: 44,
        boxShadow: '0 32px 80px rgba(21, 52, 62, 0.3), 0 0 0 10px #1e293b, 0 0 0 12px #334155',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      {/* Dynamic Island / Notch */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 104,
          height: 24,
          backgroundColor: '#000000',
          borderRadius: 14,
          zIndex: 50,
        }}
      />

      {/* Screen Content */}
      <div
        style={{
          flex: 1,
          paddingTop: 38,
          backgroundColor: REHOUSE_THEME.canvas,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {children}
      </div>

      {/* Home Indicator bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 120,
          height: 4,
          backgroundColor: '#000000',
          borderRadius: 2,
          opacity: 0.4,
          zIndex: 50,
        }}
      />
    </div>
  );
};
