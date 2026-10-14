import React from 'react';
import { Audio, interpolate, staticFile, useCurrentFrame, Sequence } from 'remotion';
import type { SoundTrackProps } from '../types';

export const SoundTrack: React.FC<SoundTrackProps> = ({ layout, totalDurationFrames }) => {
  const frame = useCurrentFrame();

  // BGM Volume envelope: Fade-in 1s (60 frames), hold at 0.28, fade-out 1.5s (90 frames)
  const bgmVolume = interpolate(
    frame,
    [0, 60, totalDurationFrames - 90, totalDurationFrames],
    [0, 0.28, 0.28, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const isLandscape = layout === 'landscape';

  // SFX Cue lists based on video layout
  const cues = isLandscape
    ? {
        // Landscape (45s = 2700 frames)
        // Scene 1: 0 - 300
        pop1: 20,
        pop2: 60,
        pop3: 100,
        whooshScene1End: 190,

        // Scene 2: 300 - 900
        whooshScene2: 300,
        popRoomSelect: 420,
        popInvoiceGenerated: 580,

        // Scene 3: 900 - 1620
        whooshScene3: 900,
        qrBeep: 1060,
        cashSuccess: 1180,

        // Scene 4: 1620 - 2160
        whooshScene4: 1620,
        popDeduction: 1740,
        popRefundResult: 1880,

        // Scene 5: 2160 - 2460
        whooshScene5: 2160,
        popLang1: 2215,
        popLang2: 2270,
        popLang3: 2325,
        popLang4: 2380,
        popLang5: 2435,

        // Scene 6: 2460 - 2700
        whooshScene6: 2460,
        dingOutro: 2530,
      }
    : {
        // Vertical (30s = 1800 frames)
        // Scene 1: 0 - 240
        pop1: 15,
        pop2: 45,
        pop3: 75,
        whooshScene1End: 150,

        // Scene 2: 240 - 660
        whooshScene2: 240,
        popRoomSelect: 330,
        popInvoiceGenerated: 460,

        // Scene 3: 660 - 1140
        whooshScene3: 660,
        qrBeep: 780,
        cashSuccess: 870,

        // Scene 4: 1140 - 1440
        whooshScene4: 1140,
        popDeduction: 1210,
        popRefundResult: 1300,

        // Scene 5: 1440 - 1620
        whooshScene5: 1440,
        popLang1: 1470,
        popLang2: 1505,
        popLang3: 1540,
        popLang4: 1575,
        popLang5: 1605,

        // Scene 6: 1620 - 1800
        whooshScene6: 1620,
        dingOutro: 1670,
      };

  return (
    <>
      {/* 1. Main Background Music (Loopable Upbeat SaaS Synth) */}
      <Audio
        src={staticFile('audio/bgm.wav')}
        volume={bgmVolume}
        startFrom={0}
      />

      {/* 2. Sound Effects synchronized frame-by-frame */}
      {/* Scene 1 Pain Points Pops */}
      <Sequence from={cues.pop1} durationInFrames={30}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.65} />
      </Sequence>
      <Sequence from={cues.pop2} durationInFrames={30}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.65} />
      </Sequence>
      <Sequence from={cues.pop3} durationInFrames={30}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.65} />
      </Sequence>
      <Sequence from={cues.whooshScene1End} durationInFrames={40}>
        <Audio src={staticFile('audio/whoosh.wav')} volume={0.55} />
      </Sequence>

      {/* Scene 2 Cues */}
      <Sequence from={cues.whooshScene2} durationInFrames={40}>
        <Audio src={staticFile('audio/whoosh.wav')} volume={0.5} />
      </Sequence>
      <Sequence from={cues.popRoomSelect} durationInFrames={30}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.6} />
      </Sequence>
      <Sequence from={cues.popInvoiceGenerated} durationInFrames={30}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.7} />
      </Sequence>

      {/* Scene 3 PayOS Aha Moment Cues */}
      <Sequence from={cues.whooshScene3} durationInFrames={40}>
        <Audio src={staticFile('audio/whoosh.wav')} volume={0.5} />
      </Sequence>
      <Sequence from={cues.qrBeep} durationInFrames={35}>
        <Audio src={staticFile('audio/qr-beep.wav')} volume={0.8} />
      </Sequence>
      <Sequence from={cues.cashSuccess} durationInFrames={120}>
        <Audio src={staticFile('audio/cash-success.wav')} volume={0.9} />
      </Sequence>

      {/* Scene 4 Deposit Management Cues */}
      <Sequence from={cues.whooshScene4} durationInFrames={40}>
        <Audio src={staticFile('audio/whoosh.wav')} volume={0.5} />
      </Sequence>
      <Sequence from={cues.popDeduction} durationInFrames={30}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.6} />
      </Sequence>
      <Sequence from={cues.popRefundResult} durationInFrames={30}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.7} />
      </Sequence>

      {/* Scene 5 i18n Morph Pops */}
      <Sequence from={cues.whooshScene5} durationInFrames={40}>
        <Audio src={staticFile('audio/whoosh.wav')} volume={0.5} />
      </Sequence>
      <Sequence from={cues.popLang1} durationInFrames={25}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.5} />
      </Sequence>
      <Sequence from={cues.popLang2} durationInFrames={25}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.5} />
      </Sequence>
      <Sequence from={cues.popLang3} durationInFrames={25}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.5} />
      </Sequence>
      <Sequence from={cues.popLang4} durationInFrames={25}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.5} />
      </Sequence>
      <Sequence from={cues.popLang5} durationInFrames={25}>
        <Audio src={staticFile('audio/pop.wav')} volume={0.5} />
      </Sequence>

      {/* Scene 6 Outro Cues */}
      <Sequence from={cues.whooshScene6} durationInFrames={40}>
        <Audio src={staticFile('audio/whoosh.wav')} volume={0.55} />
      </Sequence>
      <Sequence from={cues.dingOutro} durationInFrames={100}>
        <Audio src={staticFile('audio/cash-success.wav')} volume={0.75} />
      </Sequence>
    </>
  );
};
