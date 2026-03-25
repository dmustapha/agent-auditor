import {
  AbsoluteFill,
  useCurrentFrame,
  interpolate,
  spring,
  useVideoConfig,
  Easing,
} from 'remotion';
import { COLORS, TRUSTSCORE_CONTENT } from '../constants';
import { MONO, SERIF } from '../fonts';
import { AnimatedBackground } from '../components/AnimatedBackground';
import { LogoBadge } from '../components/LogoBadge';

const DIAL_SIZE = 280;
const STROKE_WIDTH = 16;
const RADIUS = (DIAL_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const ScoreDial = () => {
  const frame = useCurrentFrame();
  const { score } = TRUSTSCORE_CONTENT;

  const progress = interpolate(frame, [30, 150], [0, score / 100], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const displayScore = Math.round(progress * 100);
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const dialOpacity = interpolate(frame, [20, 40], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'relative',
        width: DIAL_SIZE,
        height: DIAL_SIZE,
        opacity: dialOpacity,
      }}
    >
      <svg width={DIAL_SIZE} height={DIAL_SIZE} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={DIAL_SIZE / 2}
          cy={DIAL_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={COLORS.surfaceRaised}
          strokeWidth={STROKE_WIDTH}
        />
        <circle
          cx={DIAL_SIZE / 2}
          cy={DIAL_SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
        />
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={COLORS.primaryDim} />
            <stop offset="100%" stopColor={COLORS.primaryBright} />
          </linearGradient>
        </defs>
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <span
          style={{
            fontFamily: MONO,
            fontSize: 64,
            color: COLORS.text,
            lineHeight: 1,
          }}
        >
          {displayScore}
        </span>
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 18,
            color: COLORS.textMuted,
          }}
        >
          / 100
        </span>
      </div>
    </div>
  );
};

const ProgressBar = ({
  label,
  value,
  delay,
}: {
  label: string;
  value: number;
  delay: number;
}) => {
  const frame = useCurrentFrame();

  const width = interpolate(frame, [delay, delay + 60], [0, value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  const opacity = interpolate(frame, [delay - 10, delay], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div style={{ opacity, marginBottom: 16 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <span
          style={{
            fontFamily: SERIF,
            fontSize: 18,
            color: COLORS.textSecondary,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: 20,
            color: COLORS.text,
          }}
        >
          {Math.round(width)}%
        </span>
      </div>
      <div
        style={{
          height: 10,
          background: COLORS.surfaceRaised,
          borderRadius: 5,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${width}%`,
            background: `linear-gradient(90deg, ${COLORS.primaryDim}, ${COLORS.primary})`,
            borderRadius: 5,
          }}
        />
      </div>
    </div>
  );
};

export const TrustScoreScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const verdictScale = spring({
    frame: frame - 200,
    fps,
    config: { mass: 0.6, damping: 10, stiffness: 120 },
  });

  const verdictGlow = interpolate(
    frame,
    [220, 250, 280],
    [0.3, 0.8, 0.3],
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
      <AnimatedBackground variant="default" intensity={0.6} />
      <LogoBadge delay={5} />

      <div
        style={{
          display: 'flex',
          gap: 80,
          alignItems: 'center',
          zIndex: 1,
        }}
      >
        {/* Left: dial + verdict */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 24,
          }}
        >
          <ScoreDial />
          <div
            style={{
              transform: `scale(${verdictScale})`,
              background: `${COLORS.safe}22`,
              border: `2px solid ${COLORS.safe}`,
              borderRadius: 12,
              padding: '10px 32px',
              boxShadow: `0 0 ${20 + verdictGlow * 20}px ${COLORS.safe}${Math.round(
                verdictGlow * 120,
              )
                .toString(16)
                .padStart(2, '0')}`,
            }}
          >
            <span
              style={{
                fontFamily: MONO,
                fontSize: 32,
                color: COLORS.safe,
              }}
            >
              {TRUSTSCORE_CONTENT.verdict}
            </span>
          </div>
        </div>

        {/* Right: progress bars */}
        <div style={{ width: 500 }}>
          {TRUSTSCORE_CONTENT.axes.map((axis, i) => (
            <ProgressBar
              key={axis.label}
              label={axis.label}
              value={axis.value}
              delay={100 + i * 30}
            />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
