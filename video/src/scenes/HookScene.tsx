import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Easing,
} from 'remotion';
import { COLORS, HOOK_CONTENT } from '../constants';
import { MONO, SERIF } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { GlowText } from '../components/GlowText';
import { LogoBadge } from '../components/LogoBadge';

const PARTICLES = Array.from({ length: 7 }, (_, i) => ({
  x: 15 + i * 13,
  y: 20 + ((i * 37) % 60),
  size: 4 + (i % 3) * 3,
  speed: 0.8 + (i % 4) * 0.3,
  delay: i * 8,
}));

const Particle = ({
  x,
  y,
  size,
  speed,
  delay,
}: {
  x: number;
  y: number;
  size: number;
  speed: number;
  delay: number;
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const opacity = spring({
    frame: frame - delay,
    fps,
    config: { mass: 1, damping: 20, stiffness: 40 },
  });

  const floatY = Math.sin((frame - delay) * speed * 0.05) * 15;

  return (
    <div
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        borderRadius: '50%',
        background: COLORS.primary,
        opacity: opacity * 0.4,
        transform: `translateY(${floatY}px)`,
      }}
    />
  );
};

export const HookScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Mesh background rotation
  const meshRotation = frame * 0.15;

  // Stat counter
  const statTarget = parseInt(HOOK_CONTENT.stat.replace(/\D/g, ''), 10);
  const statValue = Math.floor(
    interpolate(frame, [80, 160], [0, statTarget], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }),
  );
  const statOpacity = interpolate(frame, [75, 90], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Question slide up
  const questionY = interpolate(frame, [170, 210], [60, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const questionOpacity = interpolate(frame, [170, 200], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const labelScale = spring({
    frame: frame - 100,
    fps,
    config: { mass: 0.8, damping: 12, stiffness: 100 },
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
      <AnimatedBackground variant="default" intensity={0.8} />

      {/* Mesh gradients */}
      <div
        style={{
          position: 'absolute',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.primary}15, transparent 70%)`,
          transform: `rotate(${meshRotation}deg) scale(1.5)`,
          top: -200,
          right: -200,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.primaryBright}10, transparent 70%)`,
          transform: `rotate(${-meshRotation * 0.7}deg) scale(1.3)`,
          bottom: -150,
          left: -150,
        }}
      />

      {PARTICLES.map((p, i) => (
        <Particle key={i} {...p} />
      ))}

      <LogoBadge delay={5} />

      <div style={{ textAlign: 'center', zIndex: 1 }}>
        <GlowText
          text={HOOK_CONTENT.headline}
          fontSize={72}
          color={COLORS.primary}
          glowColor={COLORS.primary}
          delay={15}
          fontFamily={MONO}
          fontWeight={700}
          style={{ letterSpacing: 4 }}
        />

        <div style={{ opacity: statOpacity, marginTop: 40 }}>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 56,
              color: COLORS.text,
              textShadow: `0 0 30px ${COLORS.primaryBright}40`,
            }}
          >
            {statValue.toLocaleString()}+
          </span>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 22,
              color: COLORS.textSecondary,
              marginTop: 8,
              transform: `scale(${labelScale})`,
            }}
          >
            {HOOK_CONTENT.statLabel}
          </div>
        </div>

        <div
          style={{
            fontFamily: SERIF,
            fontSize: 36,
            color: COLORS.text,
            marginTop: 60,
            opacity: questionOpacity,
            transform: `translateY(${questionY}px)`,
          }}
        >
          {HOOK_CONTENT.question}
        </div>
      </div>
    </AbsoluteFill>
  );
};
