import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Easing,
} from 'remotion';
import { COLORS, PROBLEM_CONTENT } from '../constants';
import { MONO, SERIF } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { GlowText } from '../components/GlowText';
import { LogoBadge } from '../components/LogoBadge';

const CARD_STAGGER = 30;
const CARD_COLORS = [COLORS.danger, '#f97316', COLORS.caution];

const ProblemCard = ({
  label,
  icon,
  index,
  glowColor,
}: {
  label: string;
  icon: string;
  index: number;
  glowColor: string;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const delay = 80 + index * CARD_STAGGER;
  const fromLeft = index % 2 === 0;

  const slideX = interpolate(
    frame,
    [delay, delay + 30],
    [fromLeft ? -200 : 200, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    },
  );

  const opacity = interpolate(frame, [delay, delay + 20], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const glowPulse = interpolate(
    frame,
    [delay + 30, delay + 60, delay + 90],
    [0.3, 0.7, 0.3],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { mass: 0.6, damping: 10, stiffness: 120 },
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateX(${slideX}px) scale(${scale})`,
        background: COLORS.surface,
        border: `1px solid ${glowColor}44`,
        borderRadius: 16,
        padding: '28px 48px',
        boxShadow: `0 0 30px ${glowColor}${Math.round(glowPulse * 255)
          .toString(16)
          .padStart(2, '0')}`,
        display: 'flex',
        alignItems: 'center',
        gap: 20,
      }}
    >
      <span
        style={{
          fontFamily: MONO,
          fontSize: 28,
          color: glowColor,
          width: 40,
          textAlign: 'center',
          fontWeight: 700,
        }}
      >
        {icon}
      </span>
      <span
        style={{
          fontFamily: SERIF,
          fontSize: 26,
          color: COLORS.text,
        }}
      >
        {label}
      </span>
    </div>
  );
};

export const ProblemScene = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <AnimatedBackground variant="warm" intensity={0.5} />

      {/* Radial danger glow */}
      <div
        style={{
          position: 'absolute',
          width: '100%',
          height: '100%',
          background: `radial-gradient(ellipse at 50% 60%, ${COLORS.danger}11, transparent 70%)`,
        }}
      />

      <LogoBadge delay={5} />

      <div style={{ textAlign: 'center', zIndex: 1 }}>
        <GlowText
          text={PROBLEM_CONTENT.headline}
          fontSize={56}
          color={COLORS.danger}
          glowColor={COLORS.danger}
          delay={10}
          fontFamily={MONO}
          fontWeight={700}
          style={{ marginBottom: 60 }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
            alignItems: 'center',
          }}
        >
          {PROBLEM_CONTENT.cards.map((card, i) => (
            <ProblemCard
              key={card.label}
              label={card.label}
              icon={card.icon}
              index={i}
              glowColor={CARD_COLORS[i]}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
