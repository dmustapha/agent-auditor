import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Easing,
} from 'remotion';
import { COLORS, MULTICHAIN_CONTENT, SCENE_DURATIONS } from '../constants';
import { MONO, SERIF } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { LogoBadge } from '../components/LogoBadge';
import { GlowText } from '../components/GlowText';

const CHAINS = MULTICHAIN_CONTENT.chains;
const DIMENSIONS = MULTICHAIN_CONTENT.dimensions;

// Phase 1 (0-180): "pulls transaction history from Blockscout across six EVM chains"
// Phase 2 (180-350): "Base, Gnosis, Ethereum, Arbitrum, Optimism, and Polygon"
// Phase 3 (350-end): "nine dimension behavioral profile..."

const ChainBadge = ({
  name,
  index,
  frame,
  fps,
  startFrame,
}: {
  name: string;
  index: number;
  frame: number;
  fps: number;
  startFrame: number;
}) => {
  const delay = startFrame + index * 8;
  const badgeScale = spring({
    frame: frame - delay,
    fps,
    config: { mass: 0.3, damping: 10, stiffness: 120 },
  });

  const chainColors = [
    COLORS.primary,     // Base
    '#48bb78',          // Gnosis
    '#627eea',          // Ethereum
    '#28a0f0',          // Arbitrum
    '#ff0420',          // Optimism
    '#8247e5',          // Polygon
  ];

  return (
    <div
      style={{
        background: `${COLORS.surface}dd`,
        border: `1px solid ${chainColors[index]}66`,
        borderRadius: 12,
        padding: '14px 28px',
        transform: `scale(${badgeScale})`,
        opacity: badgeScale,
        backdropFilter: 'blur(8px)',
        boxShadow: `0 0 20px ${chainColors[index]}15`,
      }}
    >
      <span
        style={{
          fontFamily: SERIF,
          fontSize: 22,
          color: COLORS.text,
          fontWeight: 400,
        }}
      >
        {name}
      </span>
    </div>
  );
};

const DimensionRow = ({
  name,
  index,
  frame,
  fps,
  startFrame,
}: {
  name: string;
  index: number;
  frame: number;
  fps: number;
  startFrame: number;
}) => {
  const delay = startFrame + index * 6;
  const progress = spring({
    frame: frame - delay,
    fps,
    config: { mass: 0.5, damping: 14, stiffness: 100 },
  });

  const barWidth = interpolate(
    frame,
    [delay + 10, delay + 40],
    [0, 60 + Math.random() * 35],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) },
  );

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        opacity: progress,
        transform: `translateX(${(1 - progress) * 30}px)`,
      }}
    >
      <span
        style={{
          fontFamily: SERIF,
          fontSize: 16,
          color: COLORS.textSecondary,
          width: 180,
          textAlign: 'right',
        }}
      >
        {name}
      </span>
      <div
        style={{
          height: 6,
          width: 200,
          background: COLORS.bgLight,
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${barWidth}%`,
            background: `linear-gradient(90deg, ${COLORS.primary}, ${COLORS.primaryBright})`,
            borderRadius: 3,
          }}
        />
      </div>
    </div>
  );
};

export const DashboardShowcase = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = SCENE_DURATIONS.multichain;

  // Phase timings
  const phase1End = 180;
  const phase2End = 350;

  // Phase 1: Headline "Transaction history across six EVM chains"
  const headlineOpacity = interpolate(
    frame,
    [10, 30, phase1End - 20, phase1End],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Phase 2: Chain badges
  const chainsOpacity = interpolate(
    frame,
    [phase1End - 10, phase1End + 10, phase2End - 20, phase2End],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Phase 3: Dimensions grid
  const dimensionsOpacity = interpolate(
    frame,
    [phase2End - 10, phase2End + 10, totalFrames - 10, totalFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  // Blockscout logo text
  const blockscoutScale = spring({
    frame: frame - 40,
    fps,
    config: { mass: 0.5, damping: 12, stiffness: 100 },
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <AnimatedBackground variant="cool" intensity={0.5} />
      <LogoBadge delay={5} />

      {/* Phase 1: Blockscout + chains headline */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: headlineOpacity,
          zIndex: 1,
        }}
      >
        <GlowText
          text="Transaction History"
          fontSize={56}
          color={COLORS.text}
          glowColor={COLORS.primary}
          delay={10}
        />
        <div style={{ marginTop: 12 }}>
          <GlowText
            text="across six EVM chains"
            fontSize={28}
            color={COLORS.textSecondary}
            glowColor="transparent"
            delay={25}
          />
        </div>

        {/* Blockscout badge */}
        <div
          style={{
            marginTop: 40,
            background: `${COLORS.surface}cc`,
            border: `1px solid ${COLORS.primary}44`,
            borderRadius: 12,
            padding: '12px 32px',
            transform: `scale(${blockscoutScale})`,
            opacity: blockscoutScale,
            backdropFilter: 'blur(8px)',
          }}
        >
          <span
            style={{
              fontFamily: MONO,
              fontSize: 18,
              color: COLORS.primary,
            }}
          >
            Powered by Blockscout
          </span>
        </div>
      </div>

      {/* Phase 2: Chain badges grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: chainsOpacity,
          zIndex: 2,
        }}
      >
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 14,
            color: COLORS.textMuted,
            letterSpacing: 3,
            textTransform: 'uppercase',
            marginBottom: 30,
          }}
        >
          Supported Chains
        </span>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 20,
            justifyContent: 'center',
            maxWidth: 800,
          }}
        >
          {CHAINS.map((chain, i) => (
            <ChainBadge
              key={chain}
              name={chain}
              index={i}
              frame={frame}
              fps={fps}
              startFrame={phase1End}
            />
          ))}
        </div>
      </div>

      {/* Phase 3: Nine dimensions */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: dimensionsOpacity,
          zIndex: 3,
        }}
      >
        <GlowText
          text="Nine-Dimension Behavioral Profile"
          fontSize={40}
          color={COLORS.text}
          glowColor={COLORS.primary}
          delay={0}
        />

        <div
          style={{
            marginTop: 40,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {DIMENSIONS.map((dim, i) => (
            <DimensionRow
              key={dim}
              name={dim}
              index={i}
              frame={frame}
              fps={fps}
              startFrame={phase2End + 10}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
