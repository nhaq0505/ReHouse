import React from 'react';
import { interpolate, useCurrentFrame, Easing } from 'remotion';

export interface AnimatedCounterProps {
  from: number;
  to: number;
  startFrame: number;
  endFrame: number;
  formatter?: (value: number) => string;
  style?: React.CSSProperties;
}

export const formatVnd = (value: number): string => {
  return `${Math.round(value).toLocaleString('vi-VN')} ₫`;
};

export const formatKwh = (value: number): string => {
  return `${Math.round(value).toLocaleString('vi-VN')} kWh`;
};

export const AnimatedCounter: React.FC<AnimatedCounterProps> = ({
  from,
  to,
  startFrame,
  endFrame,
  formatter = formatVnd,
  style,
}) => {
  const frame = useCurrentFrame();

  const currentVal = interpolate(frame, [startFrame, endFrame], [from, to], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return <span style={style}>{formatter(currentVal)}</span>;
};
