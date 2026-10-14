import { useVisualTheme, themePaint, themeAsset, sceneDefaults } from '../../themes/visual-theme';
import { Img, interpolate, useCurrentFrame, Easing, getRemotionEnvironment } from 'remotion';
import { PageCam, CamKey } from './PageCam';
import layout from '../live-layout.json';

const cards = layout.projects.cards;
const PAGE_H = layout.projects.pageH;

const HOVER_H = 40; // px above the slot (translateZ) a card hovers at mid-dive
const SETTLE_EASE = Easing.bezier(0.3, 0, 0.25, 1.15); // slight overshoot / compress
const DIVE_EASE = Easing.bezier(0.3, 0, 0.2, 1); // decelerate into the hover
const SLIDE_EASE = Easing.bezier(0.35, 0, 0.2, 1); // nano-lab card slide to the top slot

// page paper colors, sampled from the rendered projects-empty texture

// ---- 16 "overflow" extras extend the grid DOWNWARD (no hovering, no overlap):
// fill the empty 3rd column of the y=1402 row, then five new rows below the
// texture at y=1795…3367, columns matching the real grid. ----
const CARD_W = cards[0]?.w || 1348;
const PAPER_EXT = { x: 0, y: PAGE_H, w: 1920, h: 400 };

const PILE = { x: 1200, y: 160 };
const N_CARDS = cards.length;
const DEAL_START = 36;
const STACK_STEP = 5;

const METAL_FADE = [34, 56] as const;

const grid = cards.map((c, k) => ({
  ...c,
  cue: DEAL_START + 8 * k,
  px: PILE.x + (((k * 7) % 9) - 4) * 2,
  py: PILE.y + (((k * 5) % 7) - 3) * 2,
  protZ: ((k * 11) % 7) - 3,
  pz: (N_CARDS - k) * STACK_STEP,
}));

// ---- the search target: P101 (card 0) stays in top slot ----
const nanoIdx = 0;
const nano = grid[0];
const NANO_TO = { x: nano.x, y: nano.y };
const CLICK_C = { x: nano.x + 300, y: nano.y + 49 };

const leaveRank = new Map<number, number>();
grid.forEach((_, i) => {
  if (i !== nanoIdx) leaveRank.set(i, leaveRank.size);
});

const SEARCH = { x: 411, y: 195, w: 1348, h: 109 };

export const SCENE_FLYIN_DEFAULTS = {
  query: 'P101',
  accent: '#109d83',
};
type SceneFlyInProps = Partial<typeof SCENE_FLYIN_DEFAULTS>;
const TYPE_START = 128;
const FILTER_START = 160;

const PILE_CX = PILE.x + 300;
const PILE_CY = PILE.y + 80;

const CAM_KEYS: CamKey[] = [
  { frame: 0, cx: PILE_CX, cy: PILE_CY, zoom: 1.45, rotX: 36, rotY: -20, rotZ: 4, persp: 1100 },
  { frame: 34, cx: PILE_CX, cy: PILE_CY, zoom: 1.35, rotX: 30, rotY: 16, rotZ: -3, persp: 1100 },
  { frame: 62, cx: 960, cy: 540, zoom: 0.90, rotX: 14, rotY: 0, rotZ: 1, persp: 1300 },
  { frame: 88, cx: 960, cy: 560, zoom: 0.86, rotX: 0, rotY: 0, rotZ: 0, persp: 1300 },
  { frame: 113, cx: 960, cy: 560, zoom: 0.86, rotX: 0, rotY: 0, rotZ: 0, persp: 1300 },
  { frame: 124, cx: 960, cy: 300, zoom: 0.95, rotX: 0, rotY: 0, rotZ: 0, persp: 1300 },
  { frame: 174, cx: 960, cy: 300, zoom: 0.95, rotX: 0, rotY: 0, rotZ: 0, persp: 1300 },
  { frame: 190, cx: CLICK_C.x, cy: CLICK_C.y, zoom: 1.55, rotX: 0, rotY: 0, rotZ: 0, persp: 1300 },
];

export const SceneFlyIn: React.FC<SceneFlyInProps> = (props) => {
  const theme = useVisualTheme();
  const paperStyle = theme.id === 'ink-press';
  const paint = (css: string) => themePaint(theme, css);
  const asset = (src: string) => themeAsset(theme, src);
  const PAPER = paint('#f9f6f1'); // page background (bottom rows)
  const FIELD = paint('#fefcf9'); // search-box interior
  const METAL_PREVIEW = paint('#383638');
  const { query: QUERY, accent } = { ...sceneDefaults(theme, 'table', SCENE_FLYIN_DEFAULTS), ...props };
  const frame = useCurrentFrame();
  const { isRendering } = getRemotionEnvironment();

  // DOF fades out over the straightening leg of the scroll (82 → 98)
  const dofStrength = interpolate(frame, [82, 98], [5, 0], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
  });

  // typed characters: one every 3 frames from TYPE_START (unhurried typing)
  const typedCount = frame < TYPE_START
    ? 0
    : Math.min(QUERY.length, Math.floor((frame - TYPE_START) / 3) + 1);
  // caret: solid while typing, then blinks on an 8-frame cycle until the click
  const caretOn =
    frame >= TYPE_START - 2 &&
    frame <= 185 &&
    (frame <= TYPE_START + 24 || Math.floor((frame - (TYPE_START + 24)) / 8) % 2 === 0);

  return (
    <PageCam
      src="textures/live/projects-empty.png"
      pageH={PAGE_H}
      keys={CAM_KEYS}
      ease={Easing.bezier(0.33, 0, 0.15, 1)}
      dof={dofStrength > 0.1 ? { focusY: 260, strength: dofStrength } : undefined}
    >
      {/* ---- dark brushed-metal table under the opening pile close-up: a huge
              plane (covers the viewport at any oblique angle) with a warm
              spotlight pooled on the stack; fades away as the camera pulls
              back and the dashboard page takes over ---- */}
      {frame < METAL_FADE[1] ? (
        <div
          style={{
            position: 'absolute',
            left: -3000,
            top: -3000,
            width: 9000,
            height: 9000,
            opacity: interpolate(frame, [METAL_FADE[0], METAL_FADE[1]], [1, 0], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            }),
            background: !paperStyle ? theme.stage : isRendering ? [
              // warm key light pooled on the pile
              paint(`radial-gradient(1300px 900px at ${3000 + PILE_CX}px ${3000 + PILE_CY}px, rgba(255,214,150,0.20), rgba(255,190,120,0.06) 40%, transparent 68%)`),
              // brushed-metal grain: fine anisotropic streaks
              paint('repeating-linear-gradient(100deg, rgba(255,255,255,0.028) 0px, rgba(255,255,255,0.028) 1px, transparent 2px, transparent 7px)'),
              paint('repeating-linear-gradient(100deg, rgba(0,0,0,0.16) 0px, rgba(0,0,0,0.16) 2px, transparent 4px, transparent 13px)'),
              // broad steel sheen
              paint('linear-gradient(115deg, #2a2d33 0%, #383c44 28%, #22242a 55%, #33363e 78%, #1d1f24 100%)'),
            ].join(', ') : METAL_PREVIEW,
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {/* ---- paper extension: the page grows past the texture so the three
              extra rows sit on paper, not on the void ---- */}
      <div
        style={{
          position: 'absolute',
          left: PAPER_EXT.x,
          top: PAPER_EXT.y,
          width: PAPER_EXT.w,
          height: PAPER_EXT.h,
          background: PAPER,
          pointerEvents: 'none',
        }}
      />

      {/* ---- filter clean-up: paper patch over the stale section headers /
              counts baked into the texture below y=500, revealed 84–92 ---- */}
      {frame >= FILTER_START ? (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 500,
            width: 1920,
            height: PAGE_H - 500,
            background: PAPER,
            opacity: interpolate(frame, [FILTER_START, FILTER_START + 8], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            }),
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {/* ---- 26 cards: visible pile at top right from frame 0, each card
              deals itself to its slot (arc flight, roll resolving) on an
              accelerating cadence; on filter the 25 non-matches fade+sink
              away and nano-lab slides up to row one ---- */}
      {grid.map((c, i) => {
        const { cue } = c;
        const radius = 16;
        const isNano = i === nanoIdx;

        // --- filter fade-out for the 25 non-target cards (staggered, 5f) ---
        const outCue = isNano ? Infinity : FILTER_START + leaveRank.get(i)! * 0.4;
        if (frame >= outCue + 5) return null;
        const outT = isNano
          ? 0
          : interpolate(frame, [outCue, outCue + 5], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.inOut(Easing.quad),
            });

        // --- beat 1: deal (cue → cue+8): from the pile pose (px,py, stack
        // height pz, small roll) to the hover pose over the slot. The flight
        // arcs UP first (z bulge) like a card snapped off the top of a deck. ---
        const diveT = interpolate(frame, [cue, cue + 8], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: DIVE_EASE,
        });

        // --- beat 2: settle (cue+8 → cue+12): Z from HOVER_H down to 0 ---
        const settleT = interpolate(frame, [cue + 8, cue + 12], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SETTLE_EASE,
        });

        // in-flight pose: pile → slot, roll resolving to 0 by touchdown-hover.
        const dx = (c.px - c.x) * (1 - diveT);
        const dy = (c.py - c.y) * (1 - diveT);
        const rotFlight = c.protZ * (1 - diveT);

        // depth: stack height → arc bulge (+90 at mid-flight) → hover → settle 0.
        const arc = Math.sin(diveT * Math.PI) * 90;
        const zDive = interpolate(diveT, [0, 1], [c.pz, HOVER_H]) + arc;
        const z = frame < cue ? c.pz : zDive * (1 - settleT); // pile height before the deal

        // scale: in the pile 1, snap up 1.06 mid-flight, settle back to 1
        const dealScale = 1 + Math.sin(diveT * Math.PI) * 0.06;
        const press = interpolate(frame, [cue + 10, cue + 11, cue + 12], [1, 0.996, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        });
        const scale = dealScale * press;

        // --- nano-lab slide (104 → 114): glide from (408,1402) to the first-row
        // slot with a light float (scale 1→1.02→1, small Z lift, wider shadow) ---
        const slideT = isNano
          ? interpolate(frame, [FILTER_START, FILTER_START + 10], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: SLIDE_EASE,
            })
          : 0;
        const slideDy = (NANO_TO.y - nano.y) * slideT;
        const slideDx = (NANO_TO.x - nano.x) * slideT;
        const float = Math.sin(slideT * Math.PI); // 0→1→0 across the slide
        const slideScale = 1 + 0.02 * float;
        const slideZ = 18 * float;

        // once fully settled, force an exact identity so the card sits flush
        // with its slot on the tilted board (no residual sub-px drift).
        const landed = frame >= cue + 12;
        const inPile = frame < cue;
        const transform = isNano && frame >= FILTER_START
          ? `translate3d(${slideDx}px, ${slideDy}px, ${slideZ}px) scale(${slideScale})`
          : outT > 0
            ? `translate3d(0px, ${8 * outT}px, 0px)`
            : landed
              ? 'translate3d(0px, 0px, 0px)'
              : inPile
                ? `translate3d(${c.px - c.x}px, ${c.py - c.y}px, ${c.pz}px) rotateZ(${c.protZ}deg)`
                : `translate3d(${dx}px, ${dy}px, ${z}px) rotateZ(${rotFlight}deg) scale(${scale})`;

        // shadow: stacked cards carry almost none (they sit on each other),
        // airborne large/soft, tight when flush, widening on the slide
        const shadow = isNano && frame >= FILTER_START
          ? paint(`0 ${2 + 14 * float}px ${6 + 26 * float}px rgba(60,45,30,${0.08 + 0.1 * float})`)
          : landed
            ? paint('0 2px 6px rgba(60,45,30,.08)')
            : inPile
              ? paint('0 1px 3px rgba(60,45,30,.14)')
              : paint(`0 ${36 - 30 * settleT}px ${70 - 60 * settleT}px rgba(60,45,30,${0.3 - 0.22 * settleT})`);

        // motion-blur ghost during the deal: a faint blurred copy trailing the flight path
        const showGhost = diveT > 0.02 && diveT < 0.98;
        const ghostLagX = (c.px - c.x) * 0.05;
        const ghostLagY = (c.py - c.y) * 0.05;

        return (
          <div key={`${c.file}-${i}`} style={{ transformStyle: 'preserve-3d' }}>
            {showGhost ? (
              <div
                style={{
                  position: 'absolute',
                  left: c.x,
                  top: c.y,
                  width: c.w,
                  height: c.h,
                  transform: `translate3d(${dx + ghostLagX}px, ${dy + ghostLagY}px, ${z}px) rotateZ(${rotFlight}deg) scale(${scale})`,
                  transformOrigin: 'center center',
                  opacity: 0.25 * (1 - diveT),
                  filter: 'blur(6px)',
                  borderRadius: radius,
                  overflow: 'hidden',
                  pointerEvents: 'none',
                }}
              >
                <Img
                  src={asset(`textures/live/${c.file}`)}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
                />
              </div>
            ) : null}

            <div
              style={{
                position: 'absolute',
                left: c.x,
                top: c.y,
                width: c.w,
                height: c.h,
                transform,
                transformOrigin: 'center center',
                boxShadow: shadow,
                borderRadius: radius,
                opacity: 1 - outT,
                overflow: 'hidden',
              }}
            >
              <Img
                src={asset(`textures/live/${c.file}`)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }}
              />
            </div>
          </div>
        );
      })}

      {/* ---- search box: paper patch over the placeholder text (keeps the
              magnifier icon), then "nano-lab" typed in with a blinking caret ---- */}
      {frame >= 118 ? (
        <div
          style={{
            position: 'absolute',
            left: 440,
            top: SEARCH.y + 4,
            width: SEARCH.x + SEARCH.w - 448,
            height: SEARCH.h - 8,
            background: FIELD,
            opacity: interpolate(frame, [118, 124], [0, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            }),
            pointerEvents: 'none',
          }}
        />
      ) : null}
      {frame >= TYPE_START - 2 ? (
        <div
          style={{
            position: 'absolute',
            left: 448,
            top: SEARCH.y,
            height: SEARCH.h,
            display: 'flex',
            alignItems: 'center',
            fontFamily: (paperStyle ? 'ui-sans-serif, system-ui, -apple-system, sans-serif' : theme.font),
            fontSize: 15,
            letterSpacing: 0.2,
            color: paint('oklch(25% 0.006 82)'),
            pointerEvents: 'none',
          }}
        >
          <span>{QUERY.slice(0, typedCount)}</span>
          {caretOn ? (
            <span
              style={{
                display: 'inline-block',
                width: 2,
                height: 20,
                marginLeft: 2,
                background: accent,
              }}
            />
          ) : null}
        </div>
      ) : null}

      {/* ---- click ripple on the filtered card: two concentric amber rings ---- */}
      {[0, 1].map((r) => {
        const start = 176 + r * 3;
        if (frame < start || frame > start + 10) return null;
        const t = interpolate(frame, [start, start + 10], [0, 1], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
        });
        const rad = interpolate(t, [0, 1], [14, r === 0 ? 54 : 78]);
        return (
          <div
            key={`ripple-${r}`}
            style={{
              position: 'absolute',
              left: CLICK_C.x - rad,
              top: CLICK_C.y - rad,
              width: rad * 2,
              height: rad * 2,
              borderRadius: '50%',
              border: `2px solid ${accent}`,
              opacity: 1 - t,
              pointerEvents: 'none',
            }}
          />
        );
      })}

      {/* ---- selected-card amber outline, lit from the click until the cut ---- */}
      {frame >= 178 ? (
        <div
          style={{
            position: 'absolute',
            left: NANO_TO.x - 6,
            top: NANO_TO.y - 6,
            width: nano.w + 12,
            height: nano.h + 12,
            borderRadius: 16,
            border: `3px solid ${accent}`,
            boxShadow: paint('0 0 40px rgba(180,120,50,0.5)'),
            opacity: interpolate(frame, [178, 181], [0.5, 1], {
              extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
            }),
            pointerEvents: 'none',
          }}
        />
      ) : null}

      {/* near-edge rim light along the extended board's leading (bottom) edge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: PAPER_EXT.y + PAPER_EXT.h - 8,
          height: 8,
          background: paint('rgba(255,255,255,0.85)'),
          filter: 'blur(6px)',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
    </PageCam>
  );
};
