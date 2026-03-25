import React from 'react';
import { useCurrentFrame } from 'remotion';
import { COLORS } from '../constants';

interface AnimatedBackgroundProps {
  variant?: 'default' | 'warm' | 'cool';
  intensity?: number;
}

export const AnimatedBackground: React.FC<AnimatedBackgroundProps> = ({
  variant = 'default',
  intensity = 0.5,
}) => {
  const frame = useCurrentFrame();

  const colors = {
    default: [COLORS.primary, COLORS.primaryBright],
    warm: [COLORS.danger, COLORS.caution],
    cool: [COLORS.safe, COLORS.primary],
  }[variant];

  const angle1 = (frame / 300) * Math.PI * 2;
  const angle2 = (frame / 400) * Math.PI * 2;

  const orb1X = 50 + Math.cos(angle1) * 20;
  const orb1Y = 40 + Math.sin(angle1) * 15;
  const orb2X = 50 + Math.cos(angle2 + Math.PI) * 25;
  const orb2Y = 60 + Math.sin(angle2 + Math.PI) * 20;

  const opacity = 0.06 * intensity;
  const alphaHex = Math.round(opacity * 255)
    .toString(16)
    .padStart(2, '0');

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${colors[0]}${alphaHex}, transparent 70%)`,
          left: `${orb1X}%`,
          top: `${orb1Y}%`,
          transform: 'translate(-50%, -50%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 600,
          height: 600,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${colors[1]}${alphaHex}, transparent 70%)`,
          left: `${orb2X}%`,
          top: `${orb2Y}%`,
          transform: 'translate(-50%, -50%)',
          filter: 'blur(30px)',
        }}
      />
    </div>
  );
};
