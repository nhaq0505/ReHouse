import React from 'react';
import { Composition } from 'remotion';
import { MainVideo } from './MainVideo';

export const Root: React.FC = () => {
  return (
    <>
      {/* 1. Landscape 16:9 Launch Video (45 seconds @ 60fps = 2700 frames) */}
      <Composition
        id="ReHouseLaunchLandscape"
        component={MainVideo}
        durationInFrames={2700}
        fps={60}
        width={1920}
        height={1080}
        defaultProps={{
          layout: 'landscape' as const,
        }}
      />

      {/* 2. TikTok / Reels / Shorts 9:16 Vertical Video (30 seconds @ 60fps = 1800 frames) */}
      <Composition
        id="ReHouseTikTokVertical"
        component={MainVideo}
        durationInFrames={1800}
        fps={60}
        width={1080}
        height={1920}
        defaultProps={{
          layout: 'vertical' as const,
        }}
      />
    </>
  );
};
