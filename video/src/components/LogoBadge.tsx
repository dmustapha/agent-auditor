import React from 'react';
import { spring, useVideoConfig, useCurrentFrame, Img, staticFile } from 'remotion';
import { COLORS } from '../constants';

interface LogoBadgeProps {
  delay?: number;
}

export const LogoBadge: React.FC<LogoBadgeProps> = ({ delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const scale = spring({
    frame: frame - delay,
    fps,
    config: { mass: 0.8, damping: 15, stiffness: 100 },
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 48,
        left: 48,
        zIndex: 50,
        transform: `scale(${scale})`,
        opacity: scale,
      }}
    >
      <Img
        src={staticFile('logo.png')}
        style={{
          width: 56,
          height: 56,
          borderRadius: 12,
          boxShadow: `0 0 20px ${COLORS.primary}40`,
        }}
      />
    </div>
  );
};
