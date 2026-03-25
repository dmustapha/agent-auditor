import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Easing,
} from 'remotion';
import { COLORS, SOLUTION_CONTENT } from '../constants';
import { MONO, SERIF } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { GlowText } from '../components/GlowText';
import { LogoBadge } from '../components/LogoBadge';

const BrowserDots = () => (
  <div style={{ display: 'flex', gap: 8, padding: '14px 16px' }}>
    {['#ef4444', '#facc15', '#4ade80'].map((c) => (
      <div
        key={c}
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: c,
        }}
      />
    ))}
  </div>
);

const ChainBadge = ({ name, delay }: { name: string; delay: number }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { mass: 0.5, damping: 12, stiffness: 150 },
  });

  return (
    <div
      style={{
        background: COLORS.surfaceRaised,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        padding: '8px 16px',
        transform: `scale(${scale})`,
        opacity: scale,
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 16,
          color: COLORS.textSecondary,
        }}
      >
        {name}
      </span>
    </div>
  );
};

export const SolutionScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const address = SOLUTION_CONTENT.address;

  const browserScale = spring({
    frame: frame - 10,
    fps,
    config: { mass: 0.8, damping: 14, stiffness: 80 },
  });

  const typedChars = Math.floor(
    interpolate(frame, [40, 40 + address.length * 1.2], [0, address.length], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }),
  );

  const glowPulse = interpolate(frame, [140, 165, 190], [0.4, 1, 0.4], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const buttonScale = spring({
    frame: frame - 130,
    fps,
    config: { mass: 0.6, damping: 10, stiffness: 120 },
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
      <AnimatedBackground variant="default" intensity={0.6} />
      <LogoBadge delay={5} />

      <div
        style={{
          width: 900,
          transform: `scale(${browserScale})`,
          opacity: browserScale,
          zIndex: 1,
        }}
      >
        <div
          style={{
            background: COLORS.surface,
            borderRadius: 16,
            border: `1px solid ${COLORS.border}`,
            overflow: 'hidden',
          }}
        >
          <BrowserDots />
          <div
            style={{
              borderTop: `1px solid ${COLORS.border}`,
              padding: 32,
            }}
          >
            {/* Address input */}
            <div
              style={{
                background: COLORS.bgLight,
                borderRadius: 10,
                padding: '16px 20px',
                border: `1px solid ${COLORS.border}`,
                marginBottom: 20,
              }}
            >
              <span
                style={{
                  fontFamily: MONO,
                  fontSize: 18,
                  color: COLORS.text,
                }}
              >
                {address.slice(0, typedChars)}
                {typedChars < address.length && (
                  <span
                    style={{
                      color: COLORS.primary,
                      opacity: frame % 12 < 6 ? 1 : 0,
                    }}
                  >
                    |
                  </span>
                )}
              </span>
            </div>

            {/* Chain selector */}
            <div
              style={{
                display: 'flex',
                gap: 10,
                flexWrap: 'wrap',
                marginBottom: 24,
              }}
            >
              {SOLUTION_CONTENT.chains.map((chain, i) => (
                <ChainBadge key={chain} name={chain} delay={90 + i * 8} />
              ))}
            </div>

            {/* Scan button */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div
                style={{
                  background: COLORS.primary,
                  borderRadius: 10,
                  padding: '14px 48px',
                  transform: `scale(${buttonScale})`,
                  boxShadow: `0 0 ${20 + glowPulse * 20}px ${COLORS.primary}${Math.round(
                    glowPulse * 180,
                  )
                    .toString(16)
                    .padStart(2, '0')}`,
                }}
              >
                <span
                  style={{
                    fontFamily: SERIF,
                    fontSize: 24,
                    color: COLORS.bg,
                    fontWeight: 'bold',
                  }}
                >
                  Scan
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Tagline */}
        <div style={{ textAlign: 'center', marginTop: 40 }}>
          <GlowText
            text={SOLUTION_CONTENT.headline}
            fontSize={28}
            color={COLORS.textSecondary}
            glowColor={COLORS.primary}
            delay={170}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
