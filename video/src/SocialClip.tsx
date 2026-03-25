import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Easing,
  Img,
  staticFile,
} from 'remotion';
import { COLORS, HOOK_CONTENT } from './constants';
import { MONO, SERIF } from './fonts';
import { AnimatedBackground } from './components/AnimatedBackground';
import { GlowText } from './components/GlowText';

export const SocialClip = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Stat counter
  const statTarget = parseInt(HOOK_CONTENT.stat.replace(/\D/g, ''), 10);
  const statValue = Math.floor(
    interpolate(frame, [60, 140], [0, statTarget], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    }),
  );
  const statOpacity = interpolate(frame, [55, 70], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Logo entrance
  const logoScale = spring({
    frame,
    fps,
    config: { mass: 0.8, damping: 15, stiffness: 100 },
  });

  // Question
  const questionOpacity = interpolate(frame, [200, 230], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const questionY = interpolate(frame, [200, 240], [40, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  // Tagline
  const taglineOpacity = interpolate(frame, [280, 310], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
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
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.primary}15, transparent 70%)`,
          top: '20%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 60px',
          zIndex: 1,
          gap: 40,
        }}
      >
        {/* Stat at top */}
        <div style={{ opacity: statOpacity, textAlign: 'center' }}>
          <span
            style={{
              fontFamily: MONO,
              fontSize: 80,
              color: COLORS.text,
              textShadow: `0 0 30px ${COLORS.primaryBright}40`,
            }}
          >
            {statValue.toLocaleString()}+
          </span>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 32,
              color: COLORS.textSecondary,
              marginTop: 8,
            }}
          >
            AI agents transacting onchain
          </div>
        </div>

        {/* Logo center */}
        <Img
          src={staticFile('logo.png')}
          style={{
            width: 120,
            height: 120,
            borderRadius: 24,
            transform: `scale(${logoScale})`,
            boxShadow: `0 0 40px ${COLORS.primary}40`,
          }}
        />

        <GlowText
          text="AgentAuditor"
          fontSize={64}
          color={COLORS.primary}
          glowColor={COLORS.primary}
          delay={20}
          fontFamily={MONO}
          fontWeight={700}
        />

        {/* Question at bottom */}
        <div
          style={{
            textAlign: 'center',
            opacity: questionOpacity,
            transform: `translateY(${questionY}px)`,
          }}
        >
          <span
            style={{
              fontFamily: SERIF,
              fontSize: 44,
              color: COLORS.text,
            }}
          >
            Which ones do you trust?
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            opacity: taglineOpacity,
            textAlign: 'center',
          }}
        >
          <span
            style={{
              fontFamily: SERIF,
              fontSize: 28,
              color: COLORS.textSecondary,
            }}
          >
            Forensic trust intelligence
          </span>
        </div>
      </div>
    </AbsoluteFill>
  );
};
