export type VideoLayout = 'landscape' | 'vertical';

export interface SceneProps {
  layout: VideoLayout;
}

export interface SoundTrackProps {
  layout: VideoLayout;
  totalDurationFrames: number;
}
