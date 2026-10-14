import React, { useMemo } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

interface ConfettiPiece {
  id: number;
  x: number;
  y: number;
  angle: number;
  speed: number;
  rotationSpeed: number;
  color: string;
  size: number;
  aspect: number;
}

export const ConfettiBurst: React.FC<{
  startFrame: number;
  originX?: number; // 0 to 1920
  originY?: number; // 0 to 1080
  count?: number;
}> = ({ startFrame, originX = 960, originY = 540, count = 48 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const colors = ['#109d83', '#248364', '#35c3a6', '#cb8b37', '#ffd166', '#06d6a0', '#ffffff'];

  // Seeded confetti pieces - ALWAYS call hooks at top level
  const pieces = useMemo<ConfettiPiece[]>(() => {
    const list: ConfettiPiece[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.sin(i * 99) * 0.4;
      const speed = 180 + ((i * 37) % 240);
      list.push({
        id: i,
        x: originX,
        y: originY,
        angle,
        speed,
        rotationSpeed: (i % 2 === 0 ? 1 : -1) * (180 + i * 20),
        color: colors[i % colors.length],
        size: 8 + (i % 8),
        aspect: 0.4 + (i % 5) * 0.15,
      });
    }
    return list;
  }, [count, originX, originY]);

  const localFrame = Math.max(0, frame - startFrame);

  const progress = spring({
    frame: localFrame,
    fps,
    config: { damping: 18, stiffness: 60, mass: 0.6 },
  });

  const opacity = interpolate(localFrame, [0, 10, 90, 150], [0, 1, 0.9, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Guard return AFTER all hooks have executed
  if (frame < startFrame || localFrame > 150) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 99,
        opacity,
      }}
    >
      {pieces.map((p) => {
        const distance = p.speed * progress;
        // Gravity effect as time progresses
        const gravity = (localFrame / fps) ** 2 * 320;
        const currentX = originX + Math.cos(p.angle) * distance;
        const currentY = originY + Math.sin(p.angle) * distance + gravity;
        const rotation = (localFrame / fps) * p.rotationSpeed;

        return (
          <div
            key={p.id}
            style={{
              position: 'absolute',
              left: currentX,
              top: currentY,
              width: p.size,
              height: p.size * p.aspect,
              backgroundColor: p.color,
              borderRadius: p.aspect > 0.6 ? 2 : 1,
              transform: `translate(-50%, -50%) rotate(${rotation}deg) scale(${Math.max(0, 1 - localFrame / 180)})`,
              boxShadow: `0 2px 6px ${p.color}40`,
            }}
          />
        );
      })}
    </div>
  );
};
