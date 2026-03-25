import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Easing,
} from 'remotion';
import { COLORS, SCANNER_LINES } from '../constants';
import { MONO } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { Terminal } from '../components/Terminal';
import { LogoBadge } from '../components/LogoBadge';

const TelegramNotification = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const notifDelay = 200;

  const slideX = interpolate(
    frame,
    [notifDelay, notifDelay + 25],
    [400, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    },
  );

  const opacity = interpolate(frame, [notifDelay, notifDelay + 15], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const pulse = spring({
    frame: frame - notifDelay - 10,
    fps,
    config: { mass: 0.5, damping: 8, stiffness: 100 },
  });

  return (
    <div
      style={{
        position: 'absolute',
        right: 80,
        top: '50%',
        transform: `translateX(${slideX}px) translateY(-50%) scale(${0.9 + pulse * 0.1})`,
        opacity,
        background: `${COLORS.surface}ee`,
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: `1px solid ${COLORS.danger}44`,
        borderRadius: 16,
        padding: '20px 28px',
        width: 320,
        boxShadow: `0 0 30px ${COLORS.danger}33`,
        zIndex: 10,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: 20,
          color: COLORS.primary,
          marginBottom: 8,
        }}
      >
        Telegram Alert
      </div>
      <div
        style={{
          fontFamily: MONO,
          fontSize: 15,
          color: COLORS.danger,
          lineHeight: 1.4,
        }}
      >
        BLOCKLIST agent detected: 0x6b75...9A80 (Score: 22/100)
      </div>
    </div>
  );
};

export const ScannerScene = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: COLORS.bg,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <AnimatedBackground variant="default" intensity={0.4} />
      <LogoBadge delay={5} />

      <div style={{ width: 820, zIndex: 1 }}>
        <Terminal
          lines={SCANNER_LINES}
          title="agent-auditor ~ loop"
          charsPerFrame={3}
          startFrame={15}
        />
      </div>

      <TelegramNotification />
    </AbsoluteFill>
  );
};
