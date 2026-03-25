import { useCurrentFrame, interpolate } from 'remotion';
import { SUBTITLES, COLORS } from '../constants';
import { SERIF } from '../fonts';

const FADE_FRAMES = 5;

export const Subtitles = () => {
  const frame = useCurrentFrame();

  const active = SUBTITLES.find(
    (s) => frame >= s.startFrame && frame < s.endFrame,
  );

  if (!active) return null;

  const opacity = interpolate(
    frame,
    [
      active.startFrame,
      active.startFrame + FADE_FRAMES,
      active.endFrame - FADE_FRAMES,
      active.endFrame,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 80,
        left: 0,
        right: 0,
        display: 'flex',
        justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        style={{
          background: 'rgba(0,0,0,0.7)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          borderRadius: 12,
          padding: '12px 32px',
          maxWidth: '80%',
          opacity,
        }}
      >
        <span
          style={{
            color: COLORS.text,
            fontFamily: SERIF,
            fontSize: 32,
            lineHeight: 1.4,
            textAlign: 'center',
            display: 'block',
          }}
        >
          {active.text}
        </span>
      </div>
    </div>
  );
};
