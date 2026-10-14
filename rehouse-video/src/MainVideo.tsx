import React from 'react';
import { Sequence } from 'remotion';
import type { VideoLayout } from './types';
import { SoundTrack } from './components/SoundTrack';
import { Scene1Hook } from './scenes/Scene1Hook';
import { Scene2Readings } from './scenes/Scene2Readings';
import { Scene3PayOS } from './scenes/Scene3PayOS';
import { Scene4Deposit } from './scenes/Scene4Deposit';
import { Scene5I18n } from './scenes/Scene5I18n';
import { Scene6Outro } from './scenes/Scene6Outro';

export interface MainVideoProps {
  layout?: VideoLayout;
}

export const MainVideo: React.FC<MainVideoProps> = ({ layout = 'landscape' }) => {
  const isLandscape = layout === 'landscape';

  const timeline = isLandscape
    ? {
        // Landscape (45s = 2700 frames @ 60fps)
        total: 2700,
        s1: { from: 0, duration: 300 },
        s2: { from: 300, duration: 600 },
        s3: { from: 900, duration: 720 },
        s4: { from: 1620, duration: 540 },
        s5: { from: 2160, duration: 300 },
        s6: { from: 2460, duration: 240 },
      }
    : {
        // Vertical TikTok / Shorts (30s = 1800 frames @ 60fps)
        total: 1800,
        s1: { from: 0, duration: 240 },
        s2: { from: 240, duration: 420 },
        s3: { from: 660, duration: 480 },
        s4: { from: 1140, duration: 300 },
        s5: { from: 1440, duration: 180 },
        s6: { from: 1620, duration: 180 },
      };

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        backgroundColor: '#0e232a',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* 1. Synchronized BGM and Sound Effects */}
      <SoundTrack layout={layout} totalDurationFrames={timeline.total} />

      {/* 2. Visual Sequences */}
      <Sequence from={timeline.s1.from} durationInFrames={timeline.s1.duration}>
        <Scene1Hook layout={layout} />
      </Sequence>

      <Sequence from={timeline.s2.from} durationInFrames={timeline.s2.duration}>
        <Scene2Readings layout={layout} />
      </Sequence>

      <Sequence from={timeline.s3.from} durationInFrames={timeline.s3.duration}>
        <Scene3PayOS layout={layout} />
      </Sequence>

      <Sequence from={timeline.s4.from} durationInFrames={timeline.s4.duration}>
        <Scene4Deposit layout={layout} />
      </Sequence>

      <Sequence from={timeline.s5.from} durationInFrames={timeline.s5.duration}>
        <Scene5I18n layout={layout} />
      </Sequence>

      <Sequence from={timeline.s6.from} durationInFrames={timeline.s6.duration}>
        <Scene6Outro layout={layout} />
      </Sequence>
    </div>
  );
};
