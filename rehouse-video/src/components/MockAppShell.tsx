import React from 'react';
import { REHOUSE_THEME } from '../constants/theme';
import { ReHouseLogo } from './ReHouseLogo';

export interface MockAppShellProps {
  activeKey?: string;
  headerTitle?: string;
  children: React.ReactNode;
  hideSider?: boolean;
}

const MENU_ITEMS = [
  { key: '/dashboard', label: 'Tổng quan', icon: '▦' },
  { key: '/buildings', label: 'Dãy trọ', icon: '🏛' },
  { key: '/rooms', label: 'Phòng & người thuê', icon: '🏠' },
  { key: '/readings', label: 'Chỉ số điện nước', icon: '⚡' },
  { key: '/invoices', label: 'Hóa đơn & Đối soát', icon: '📄' },
  { key: '/reports', label: 'Báo cáo doanh thu', icon: '📊' },
  { key: '/settings/payment', label: 'Thanh toán PayOS', icon: '💳' },
];

export const MockAppShell: React.FC<MockAppShellProps> = ({
  activeKey = '/rooms',
  headerTitle = 'Quản lý phòng & người thuê',
  children,
  hideSider = false,
}) => {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: REHOUSE_THEME.canvas,
        fontFamily: REHOUSE_THEME.fontBody,
        color: REHOUSE_THEME.ink,
        overflow: 'hidden',
      }}
    >
      {/* Sider */}
      {!hideSider && (
        <aside
          style={{
            width: 250,
            backgroundColor: REHOUSE_THEME.navy,
            color: '#c5d7d5',
            display: 'flex',
            flexDirection: 'column',
            padding: '24px 16px 16px',
            borderRight: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}
        >
          {/* Brand */}
          <div style={{ marginBottom: 28 }}>
            <ReHouseLogo scale={0.78} theme="dark" />
          </div>

          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.4,
              color: 'rgba(217, 236, 232, 0.4)',
              margin: '0 8px 10px',
              textTransform: 'uppercase',
            }}
          >
            Menu chính
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {MENU_ITEMS.map((item) => {
              const isSelected = item.key === activeKey;
              return (
                <div
                  key={item.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    height: 44,
                    padding: '0 14px',
                    borderRadius: 10,
                    fontSize: 13.5,
                    fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? '#eafff9' : '#c5d7d5',
                    backgroundColor: isSelected ? 'rgba(29, 164, 139, 0.22)' : 'transparent',
                    borderLeft: isSelected ? `3px solid #35c3a6` : '3px solid transparent',
                  }}
                >
                  <span style={{ fontSize: 16, color: isSelected ? '#67d7bf' : 'inherit' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              );
            })}
          </nav>

          {/* Help card */}
          <div style={{ marginTop: 'auto', paddingTop: 16 }}>
            <div
              style={{
                padding: '14px 16px',
                borderRadius: 12,
                backgroundColor: 'rgba(246, 255, 252, 0.07)',
                border: '1px solid rgba(233, 251, 246, 0.1)',
                color: '#f1fffc',
              }}
            >
              <div
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 6,
                  backgroundColor: 'rgba(39, 181, 151, 0.2)',
                  color: '#77dec7',
                  display: 'grid',
                  placeItems: 'center',
                  marginBottom: 8,
                  fontSize: 13,
                }}
              >
                ✦
              </div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Tự động hóa 100%</div>
              <div style={{ fontSize: 11.5, color: '#afc4c1', marginTop: 3 }}>
                Đối soát VietQR thời gian thực
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* Main Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
        {/* Top Header */}
        <header
          style={{
            height: 60,
            backgroundColor: '#ffffff',
            borderBottom: `1px solid ${REHOUSE_THEME.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 28px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                fontFamily: REHOUSE_THEME.fontDisplay,
                color: REHOUSE_THEME.ink,
              }}
            >
              {headerTitle}
            </h1>
            <span
              style={{
                fontSize: 12,
                padding: '3px 8px',
                borderRadius: 6,
                backgroundColor: REHOUSE_THEME.tealLight,
                color: REHOUSE_THEME.tealDark,
                fontWeight: 600,
              }}
            >
              Tòa nhà Nguyễn Văn Cừ
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {/* Quick Lang badge */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 8,
                backgroundColor: REHOUSE_THEME.canvas,
                fontSize: 12,
                color: REHOUSE_THEME.muted,
                border: `1px solid ${REHOUSE_THEME.controlBorder}`,
              }}
            >
              <span>🌐</span>
              <span>Tiếng Việt</span>
            </div>

            {/* User profile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  backgroundColor: REHOUSE_THEME.tealDark,
                  color: '#ffffff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: 14,
                }}
              >
                CT
              </div>
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Chủ trọ Minh Quân</div>
                <div style={{ fontSize: 11, color: REHOUSE_THEME.muted }}>18 phòng hoạt động</div>
              </div>
            </div>
          </div>
        </header>

        {/* Content View */}
        <main style={{ flex: 1, padding: '24px 28px', overflow: 'hidden', position: 'relative' }}>
          {children}
        </main>
      </div>
    </div>
  );
};
