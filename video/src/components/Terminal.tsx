import React from 'react';
import { useCurrentFrame, interpolate, spring, useVideoConfig } from 'remotion';
import { COLORS, TERMINAL } from '../constants';
import { MONO } from '../fonts';

type LineColor = 'text' | 'green' | 'yellow' | 'red' | 'blue' | 'purple' | 'prompt';

export interface TerminalLine {
  text: string;
  color: LineColor;
}

interface TerminalProps {
  lines: TerminalLine[];
  title?: string;
  charsPerFrame?: number;
  startFrame?: number;
}

const colorMap: Record<LineColor, string> = {
  text: TERMINAL.text,
  green: TERMINAL.green,
  yellow: TERMINAL.yellow,
  red: TERMINAL.red,
  blue: TERMINAL.blue,
  purple: TERMINAL.purple,
  prompt: TERMINAL.prompt,
};

export const Terminal: React.FC<TerminalProps> = ({
  lines,
  title = 'Terminal',
  charsPerFrame = 3,
  startFrame = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const relFrame = frame - startFrame;

  if (relFrame < 0) return null;

  let totalChars = 0;
  const lineStarts: number[] = [];
  for (const line of lines) {
    lineStarts.push(totalChars);
    totalChars += Math.max(line.text.length, 1);
  }

  const charsRevealed = relFrame * charsPerFrame;

  const containerOpacity = interpolate(relFrame, [0, 10], [0, 1], {
    extrapolateRight: 'clamp',
  });

  const scale = spring({
    frame: relFrame,
    fps,
    config: { damping: 200, stiffness: 100, mass: 0.5 },
  });

  return (
    <div
      style={{
        backgroundColor: TERMINAL.bg,
        borderRadius: 12,
        border: '1px solid #30363d',
        overflow: 'hidden',
        opacity: containerOpacity,
        transform: `scale(${0.95 + scale * 0.05})`,
        boxShadow: `0 20px 60px rgba(0,0,0,0.5), 0 0 30px ${COLORS.primary}10`,
        width: '100%',
        maxWidth: 1200,
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '12px 16px',
          backgroundColor: '#161b22',
          borderBottom: '1px solid #30363d',
          gap: 8,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#f85149' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#d29922' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', backgroundColor: '#3fb950' }} />
        <span
          style={{
            color: '#8b949e',
            fontSize: 14,
            marginLeft: 8,
            fontFamily: MONO,
          }}
        >
          {title}
        </span>
      </div>

      {/* Content */}
      <div
        style={{
          padding: '20px 24px',
          fontFamily: MONO,
          fontSize: 18,
          lineHeight: 1.6,
        }}
      >
        {lines.map((line, i) => {
          const lineStart = lineStarts[i];
          const lineCharsShown = Math.max(
            0,
            Math.min(line.text.length, charsRevealed - lineStart),
          );

          if (charsRevealed < lineStart) return null;

          const displayText = line.text.slice(0, lineCharsShown);
          const showCursor =
            lineCharsShown < line.text.length && charsRevealed >= lineStart;

          return (
            <div key={i} style={{ color: colorMap[line.color], minHeight: 28 }}>
              {displayText}
              {showCursor && (
                <span
                  style={{
                    backgroundColor: '#c9d1d9',
                    width: 10,
                    height: 20,
                    display: 'inline-block',
                    opacity: Math.sin(frame * 0.3) > 0 ? 1 : 0,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
