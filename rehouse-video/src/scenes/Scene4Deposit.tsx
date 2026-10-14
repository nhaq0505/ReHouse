import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { REHOUSE_THEME } from '../constants/theme';
import { AnimatedCounter, formatVnd } from '../components/AnimatedCounter';
import type { SceneProps } from '../types';

export const Scene4Deposit: React.FC<SceneProps> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isLandscape = layout === 'landscape';

  // Relative timing
  const tDrawerSlide = isLandscape ? 20 : 15;
  const tRowDeduct1 = isLandscape ? 90 : 65;
  const tRowDeduct2 = isLandscape ? 150 : 110;
  const tFinalSum = isLandscape ? 220 : 160;

  // Drawer slide-in spring from right
  const drawerSpring = spring({
    frame: frame - tDrawerSlide,
    fps,
    config: { damping: 16, stiffness: 100 },
  });

  const row1Spring = spring({ frame: frame - tRowDeduct1, fps, config: { damping: 12, stiffness: 110 } });
  const row2Spring = spring({ frame: frame - tRowDeduct2, fps, config: { damping: 12, stiffness: 110 } });
  const sumSpring = spring({ frame: frame - tFinalSum, fps, config: { damping: 14, stiffness: 120 } });

  const initialDeposit = 5000000;
  const electricWaterDeduction = 650000;
  const cleaningDeduction = 200000;
  const finalRefund = initialDeposit - electricWaterDeduction - cleaningDeduction; // 4,150,000

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: REHOUSE_THEME.canvas,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: REHOUSE_THEME.fontBody,
      }}
    >
      {/* Background Dim Backdrop */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(21, 52, 62, 0.45)',
          opacity: drawerSpring,
        }}
      />

      {/* Main Drawer Modal mimicking MoveoutDrawer.tsx */}
      <div
        style={{
          width: isLandscape ? 880 : '92%',
          maxHeight: '90%',
          backgroundColor: '#ffffff',
          borderRadius: 24,
          boxShadow: '0 30px 80px rgba(0,0,0,0.22), 0 4px 20px rgba(0,0,0,0.06)',
          border: `1px solid ${REHOUSE_THEME.border}`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transform: `translateX(${(1 - drawerSpring) * (isLandscape ? 400 : 200)}px) scale(${0.92 + 0.08 * drawerSpring})`,
          opacity: drawerSpring,
          position: 'relative',
          zIndex: 20,
        }}
      >
        {/* Drawer Header */}
        <div
          style={{
            padding: '24px 32px',
            borderBottom: `1px solid ${REHOUSE_THEME.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            backgroundColor: '#ffffff',
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: REHOUSE_THEME.tealDark,
                textTransform: 'uppercase',
                letterSpacing: 1.2,
              }}
            >
              MoveoutDrawer • Quyết toán trả phòng
            </div>
            <h2
              style={{
                margin: '4px 0 0 0',
                fontSize: isLandscape ? 22 : 18,
                fontWeight: 700,
                color: REHOUSE_THEME.ink,
                fontFamily: REHOUSE_THEME.fontDisplay,
              }}
            >
              Tất toán phòng P.201 — Nguyễn Văn An
            </h2>
          </div>

          <span
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              backgroundColor: '#eaf6ef',
              color: '#226747',
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            Đủ điều kiện trả phòng
          </span>
        </div>

        {/* Drawer Content */}
        <div style={{ padding: isLandscape ? '28px 32px' : '20px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Deposit Held Banner */}
          <div
            style={{
              backgroundColor: REHOUSE_THEME.navyDark,
              borderRadius: 16,
              padding: '20px 24px',
              color: '#ffffff',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <div>
              <span style={{ fontSize: 12.5, color: 'rgba(233, 246, 243, 0.7)' }}>
                TIỀN CỌC GỐC ĐANG GIỮ THEO HỢP ĐỒNG
              </span>
              <div style={{ fontSize: 13, color: '#67d7bf', marginTop: 2 }}>
                Đã thu ngày 15/10/2025 • Hợp đồng 12 tháng
              </div>
            </div>

            <div
              style={{
                fontSize: isLandscape ? 28 : 22,
                fontWeight: 800,
                fontFamily: REHOUSE_THEME.fontDisplay,
                color: '#ffffff',
              }}
            >
              {formatVnd(initialDeposit)}
            </div>
          </div>

          {/* Sổ cái khấu trừ DepositLedger */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: REHOUSE_THEME.muted, letterSpacing: 0.5 }}>
              CÁC KHOẢN KHẤU TRỪ TỰ ĐỘNG:
            </div>

            {/* Deduction Row 1 */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: `1px solid ${REHOUSE_THEME.border}`,
                borderRadius: 14,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transform: `scale(${frame >= tRowDeduct1 ? row1Spring : 0.95})`,
                opacity: frame >= tRowDeduct1 ? row1Spring : 0.3,
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18, color: REHOUSE_THEME.red }}>⚡</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: REHOUSE_THEME.ink }}>
                    Tiền điện nước tháng cuối (chưa thanh toán)
                  </div>
                  <div style={{ fontSize: 12, color: REHOUSE_THEME.muted }}>
                    Khấu trừ tự động vào hóa đơn INV-2026-10-201
                  </div>
                </div>
              </div>

              <strong style={{ fontSize: 15, color: REHOUSE_THEME.red }}>
                - {formatVnd(electricWaterDeduction)}
              </strong>
            </div>

            {/* Deduction Row 2 */}
            <div
              style={{
                backgroundColor: '#ffffff',
                border: `1px solid ${REHOUSE_THEME.border}`,
                borderRadius: 14,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                transform: `scale(${frame >= tRowDeduct2 ? row2Spring : 0.95})`,
                opacity: frame >= tRowDeduct2 ? row2Spring : 0.3,
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 18, color: REHOUSE_THEME.amber }}>🧹</span>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: REHOUSE_THEME.ink }}>
                    Phí vệ sinh chuyên sâu & sơn dặm tường
                  </div>
                  <div style={{ fontSize: 12, color: REHOUSE_THEME.muted }}>
                    Theo thỏa thuận biên bản bàn giao phòng
                  </div>
                </div>
              </div>

              <strong style={{ fontSize: 15, color: REHOUSE_THEME.red }}>
                - {formatVnd(cleaningDeduction)}
              </strong>
            </div>
          </div>

          {/* Final Calculated Refund Result */}
          <div
            style={{
              backgroundColor: REHOUSE_THEME.tealLight,
              border: `2px solid ${REHOUSE_THEME.teal}`,
              borderRadius: 18,
              padding: '18px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transform: `scale(${frame >= tFinalSum ? sumSpring : 0.96})`,
              opacity: frame >= tFinalSum ? sumSpring : 0.4,
              boxShadow: '0 12px 30px rgba(16, 157, 131, 0.15)',
            }}
          >
            <div>
              <span style={{ fontSize: 12, fontWeight: 700, color: REHOUSE_THEME.tealDark, textTransform: 'uppercase' }}>
                SỐ TIỀN HOÀN TRẢ KHÁCH THUÊ
              </span>
              <div style={{ fontSize: 13, color: REHOUSE_THEME.muted, marginTop: 2 }}>
                5.000.000 ₫ - 650.000 ₫ - 200.000 ₫
              </div>
            </div>

            <div
              style={{
                fontSize: isLandscape ? 32 : 24,
                fontWeight: 800,
                fontFamily: REHOUSE_THEME.fontDisplay,
                color: REHOUSE_THEME.tealDark,
              }}
            >
              <AnimatedCounter
                from={initialDeposit}
                to={finalRefund}
                startFrame={tFinalSum}
                endFrame={tFinalSum + 40}
              />
            </div>
          </div>
        </div>

        {/* Drawer Action Footer */}
        <div
          style={{
            padding: '18px 32px',
            backgroundColor: '#f8faf9',
            borderTop: `1px solid ${REHOUSE_THEME.border}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: REHOUSE_THEME.tealDark, fontWeight: 600 }}>
            <span>🔒</span>
            <span>Lưu vết sổ cái không thể sửa đổi (Idempotent Ledger)</span>
          </div>

          <button
            style={{
              padding: '10px 24px',
              backgroundColor: REHOUSE_THEME.teal,
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              fontSize: 13.5,
              fontWeight: 700,
              boxShadow: '0 4px 14px rgba(16, 157, 131, 0.3)',
            }}
          >
            In biên bản tất toán & Hoàn cọc
          </button>
        </div>
      </div>
    </div>
  );
};
