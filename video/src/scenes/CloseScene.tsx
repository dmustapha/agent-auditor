import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Img,
  staticFile,
} from 'remotion';
import { COLORS, CLOSE_CONTENT, SCENE_DURATIONS } from '../constants';
import { SERIF } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { GlowText } from '../components/GlowText';

export const CloseScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const totalFrames = SCENE_DURATIONS.close;
  const badgeStart = Math.floor(totalFrames * 0.5);

  // Logo entrance
  const logoScale = spring({
    frame,
    fps,
    config: { mass: 0.8, damping: 15, stiffness: 100 },
  });

  // Corner brackets grow in
  const bracketProgress = spring({
    frame: frame - 10,
    fps,
    config: { mass: 1, damping: 20, stiffness: 60 },
  });

  // Final fade out
  const fadeOut = interpolate(
    frame,
    [totalFrames - 20, totalFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

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

      {/* Large central glow pulse */}
      <div
        style={{
          position: 'absolute',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.primary}30, ${COLORS.primaryDim}10, transparent 70%)`,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          opacity: fadeOut,
        }}
      />

      {/* Corner brackets */}
      {[
        { top: 80, left: 80 },
        { top: 80, right: 80 },
        { bottom: 80, left: 80 },
        { bottom: 80, right: 80 },
      ].map((pos, i) => {
        const isTop = 'top' in pos;
        const isLeft = 'left' in pos;
        const rotation = isTop
          ? isLeft ? 0 : 90
          : isLeft ? 270 : 180;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              ...pos,
              width: 50,
              height: 50,
              borderTop: `2px solid ${COLORS.primary}`,
              borderLeft: `2px solid ${COLORS.primary}`,
              transform: `rotate(${rotation}deg) scale(${bracketProgress})`,
              opacity: bracketProgress * 0.5 * fadeOut,
            }}
          />
        );
      })}

      {/* Main content */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1,
          opacity: fadeOut,
        }}
      >
        {/* Logo */}
        <Img
          src={staticFile('logo.png')}
          style={{
            width: 120,
            height: 120,
            borderRadius: 24,
            transform: `scale(${logoScale})`,
            boxShadow: `0 0 60px ${COLORS.primary}50, 0 0 120px ${COLORS.primary}20`,
            marginBottom: 40,
          }}
        />

        {/* Project name */}
        <GlowText
          text={CLOSE_CONTENT.name}
          fontSize={80}
          color={COLORS.text}
          glowColor={COLORS.primary}
          delay={5}
        />

        {/* Tagline */}
        <div style={{ marginTop: 12 }}>
          <GlowText
            text={CLOSE_CONTENT.tagline}
            fontSize={28}
            color={COLORS.textSecondary}
            glowColor={COLORS.primary}
            delay={25}
          />
        </div>

        {/* Built on section */}
        <div
          style={{
            marginTop: 60,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
            opacity: interpolate(
              frame,
              [badgeStart, badgeStart + 15],
              [0, 1],
              { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
            ),
          }}
        >
          <span
            style={{
              fontFamily: SERIF,
              fontSize: 14,
              color: COLORS.textMuted,
              letterSpacing: 3,
              textTransform: 'uppercase',
            }}
          >
            Built on
          </span>

          <div style={{ display: 'flex', gap: 16 }}>
            {CLOSE_CONTENT.builtOn.map((tech, i) => {
              const badgeScale = spring({
                frame: frame - badgeStart - i * 8,
                fps,
                config: { mass: 0.3, damping: 10, stiffness: 120 },
              });
              return (
                <div
                  key={tech}
                  style={{
                    background: `${COLORS.surface}cc`,
                    border: `1px solid ${COLORS.primary}44`,
                    borderRadius: 10,
                    padding: '10px 28px',
                    transform: `scale(${badgeScale})`,
                    opacity: badgeScale,
                    backdropFilter: 'blur(8px)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: SERIF,
                      fontSize: 20,
                      color: COLORS.text,
                    }}
                  >
                    {tech}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
