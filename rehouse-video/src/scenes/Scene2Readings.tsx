import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { REHOUSE_THEME, MOCK_ROOMS } from '../constants/theme';
import { MockAppShell } from '../components/MockAppShell';
import { AnimatedCounter, formatVnd } from '../components/AnimatedCounter';
import type { SceneProps } from '../types';

export const Scene2Readings: React.FC<SceneProps> = ({ layout }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const isLandscape = layout === 'landscape';

  // Responsive relative timing (local frame within Scene 2)
  const tZoomIn = isLandscape ? 40 : 25;
  const tTypeNumber = isLandscape ? 90 : 60;
  const tClickButton = isLandscape ? 170 : 120;
  const tInvoicePop = isLandscape ? 210 : 150;

  // Entrance spring
  const sceneEntrance = spring({
    frame,
    fps,
    config: { damping: 16, stiffness: 90 },
  });

  // Focus zoom into Room P.201
  const focusZoom = interpolate(frame, [tZoomIn, tZoomIn + 40], [1, isLandscape ? 1.02 : 1.01], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Number input animation for new electric reading
  const readingStartVal = 1420;
  const readingTargetVal = 1565;
  const currentKwhVal = Math.round(
    interpolate(frame, [tTypeNumber, tTypeNumber + 50], [readingStartVal, readingTargetVal], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    })
  );

  const kwhDiff = Math.max(0, currentKwhVal - readingStartVal);
  const electricAmount = kwhDiff * 3500;
  const waterAmount = currentKwhVal > 1430 ? 200000 : 0;
  const rentAmount = 3200000;

  // Button click scale pulse
  const btnClickProgress = interpolate(
    frame,
    [tClickButton, tClickButton + 10, tClickButton + 20],
    [1, 0.92, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Invoice Card pop entrance
  const invoiceSpring = spring({
    frame: frame - tInvoicePop,
    fps,
    config: { damping: 13, stiffness: 100 },
  });

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: REHOUSE_THEME.canvas,
        transform: `scale(${sceneEntrance})`,
        opacity: sceneEntrance,
        overflow: 'hidden',
        position: 'relative',
        fontFamily: REHOUSE_THEME.fontBody,
      }}
    >
      <MockAppShell activeKey="/readings" headerTitle="Chốt chỉ số điện nước & Lập hóa đơn" hideSider={!isLandscape}>
        <div
          style={{
            display: 'flex',
            flexDirection: isLandscape ? 'row' : 'column',
            gap: 20,
            height: '100%',
            transform: `scale(${focusZoom})`,
            transformOrigin: 'center center',
          }}
        >
          {/* Left Column: Room Grid & Readings Input */}
          <div style={{ flex: isLandscape ? 1.2 : 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Toolbar */}
            <div
              style={{
                backgroundColor: '#ffffff',
                padding: '12px 18px',
                borderRadius: 14,
                border: `1px solid ${REHOUSE_THEME.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: REHOUSE_THEME.muted }}>Kỳ ghi chỉ số:</span>
                <span
                  style={{
                    backgroundColor: REHOUSE_THEME.tealLight,
                    color: REHOUSE_THEME.tealDark,
                    fontWeight: 700,
                    padding: '4px 12px',
                    borderRadius: 8,
                    fontSize: 13,
                  }}
                >
                  📅 Tháng 10/2026
                </span>
              </div>
              <div style={{ fontSize: 13, color: REHOUSE_THEME.muted }}>
                Đã chốt: <strong style={{ color: REHOUSE_THEME.tealDark }}>3/4 phòng</strong>
              </div>
            </div>

            {/* Room cards list */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isLandscape ? 'repeat(2, 1fr)' : '1fr',
                gap: 12,
              }}
            >
              {MOCK_ROOMS.map((room) => {
                const isSelected = room.code === 'P.201';
                const isOccupied = room.status === 'occupied';

                return (
                  <div
                    key={room.id}
                    style={{
                      backgroundColor: '#ffffff',
                      borderRadius: 14,
                      padding: 16,
                      border: isSelected
                        ? `2px solid ${REHOUSE_THEME.teal}`
                        : `1px solid ${REHOUSE_THEME.border}`,
                      boxShadow: isSelected
                        ? '0 12px 28px rgba(16, 157, 131, 0.16)'
                        : '0 2px 8px rgba(0,0,0,0.03)',
                      position: 'relative',
                    }}
                  >
                    {/* Header: Room Name + Status Badge */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <div>
                        <strong style={{ fontSize: 16, color: REHOUSE_THEME.ink, display: 'block' }}>
                          {room.code}
                        </strong>
                        <span style={{ fontSize: 12, color: REHOUSE_THEME.muted }}>{room.tenantName}</span>
                      </div>

                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 8px',
                          borderRadius: 6,
                          backgroundColor: isOccupied ? '#eaf6ef' : '#f0f4f2',
                          color: isOccupied ? '#226747' : REHOUSE_THEME.muted,
                        }}
                      >
                        {isOccupied ? 'Đang thuê' : 'Phòng trống'}
                      </span>
                    </div>

                    {/* Readings Form Simulation */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: REHOUSE_THEME.muted, marginBottom: 4 }}>Số điện cũ</div>
                        <div
                          style={{
                            padding: '6px 8px',
                            borderRadius: 8,
                            backgroundColor: '#f8faf9',
                            border: `1px solid ${REHOUSE_THEME.controlBorder}`,
                            fontSize: 12.5,
                            fontWeight: 600,
                          }}
                        >
                          {room.prevReading} kWh
                        </div>
                      </div>

                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: REHOUSE_THEME.muted, marginBottom: 4 }}>Số điện mới</div>
                        <div
                          style={{
                            padding: '6px 8px',
                            borderRadius: 8,
                            backgroundColor: isSelected ? '#ffffff' : '#f8faf9',
                            border: isSelected
                              ? `2px solid ${REHOUSE_THEME.teal}`
                              : `1px solid ${REHOUSE_THEME.controlBorder}`,
                            fontSize: 12.5,
                            fontWeight: 700,
                            color: isSelected ? REHOUSE_THEME.tealDark : REHOUSE_THEME.ink,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                          }}
                        >
                          <span>{isSelected ? currentKwhVal : room.newReading}</span>
                          <span style={{ fontSize: 11, color: REHOUSE_THEME.muted }}>kWh</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    {isSelected ? (
                      <button
                        style={{
                          width: '100%',
                          height: 36,
                          backgroundColor: REHOUSE_THEME.teal,
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 8,
                          fontWeight: 600,
                          fontSize: 12.5,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          transform: `scale(${btnClickProgress})`,
                          boxShadow: '0 4px 12px rgba(16, 157, 131, 0.28)',
                        }}
                      >
                        <span>✓</span>
                        <span>{frame >= tClickButton ? 'Đã lập hóa đơn' : 'Chốt số & Lập hóa đơn'}</span>
                      </button>
                    ) : (
                      <div
                        style={{
                          fontSize: 11.5,
                          color: REHOUSE_THEME.muted,
                          textAlign: 'center',
                          padding: '6px 0',
                        }}
                      >
                        Tiền phòng: {formatVnd(room.price)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Real-time Generated Invoice Bill */}
          <div
            style={{
              flex: isLandscape ? 0.95 : 1,
              backgroundColor: '#ffffff',
              borderRadius: 18,
              padding: '20px 22px',
              border: `1px solid ${REHOUSE_THEME.border}`,
              boxShadow: '0 16px 40px rgba(0,0,0,0.06)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transform: `scale(${frame >= tInvoicePop ? invoiceSpring : 0.95})`,
              opacity: frame >= tInvoicePop ? invoiceSpring : 0.4,
            }}
          >
            {/* Invoice Header */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: `1px solid ${REHOUSE_THEME.border}`, paddingBottom: 14 }}>
                <div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 1.2,
                      color: REHOUSE_THEME.tealDark,
                      textTransform: 'uppercase',
                    }}
                  >
                    Hóa đơn tự động sinh
                  </span>
                  <h3 style={{ margin: '3px 0 0 0', fontSize: 17, fontWeight: 700, color: REHOUSE_THEME.ink }}>
                    Hóa đơn P.201 - Tháng 10/2026
                  </h3>
                  <span style={{ fontSize: 12, color: REHOUSE_THEME.muted }}>Khách thuê: Nguyễn Văn An</span>
                </div>
                <span
                  style={{
                    fontSize: 11.5,
                    fontWeight: 600,
                    padding: '4px 10px',
                    borderRadius: 6,
                    backgroundColor: REHOUSE_THEME.amberLight,
                    color: REHOUSE_THEME.amber,
                  }}
                >
                  Chờ thanh toán
                </span>
              </div>

              {/* Line items list */}
              <div style={{ padding: '14px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: REHOUSE_THEME.muted }}>1. Tiền thuê phòng (30 ngày)</span>
                  <strong>{formatVnd(rentAmount)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: REHOUSE_THEME.muted }}>
                    2. Tiền điện ({kwhDiff} kWh x 3.500₫)
                  </span>
                  <strong>{formatVnd(electricAmount)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: REHOUSE_THEME.muted }}>3. Tiền nước sinh hoạt (8 m³)</span>
                  <strong>{formatVnd(waterAmount)}</strong>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span style={{ color: REHOUSE_THEME.muted }}>4. Dịch vụ (Rác, Wifi, Thang máy)</span>
                  <span style={{ color: REHOUSE_THEME.tealDark, fontWeight: 600 }}>Miễn phí</span>
                </div>
              </div>
            </div>

            {/* Total Footer */}
            <div
              style={{
                backgroundColor: REHOUSE_THEME.canvas,
                borderRadius: 12,
                padding: '14px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: 'auto',
              }}
            >
              <div>
                <span style={{ fontSize: 11.5, color: REHOUSE_THEME.muted, display: 'block' }}>TỔNG CỘNG HÓA ĐƠN</span>
                <span style={{ fontSize: 10.5, color: REHOUSE_THEME.tealDark, fontWeight: 600 }}>Tự động gán mã VietQR</span>
              </div>

              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  fontFamily: REHOUSE_THEME.fontDisplay,
                  color: REHOUSE_THEME.tealDark,
                }}
              >
                <AnimatedCounter
                  from={0}
                  to={3907500}
                  startFrame={tInvoicePop}
                  endFrame={tInvoicePop + 45}
                />
              </div>
            </div>
          </div>
        </div>
      </MockAppShell>
    </div>
  );
};
