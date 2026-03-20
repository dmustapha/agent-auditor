"use client";

import type { UITrustScore } from "@/lib/types";

interface TrustScoreCardProps {
  score: UITrustScore;
}

export function TrustScoreCard({ score }: TrustScoreCardProps) {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score.score / score.maxScore) * circumference;

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-6">
      {/* Header with chain badge */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-sm text-text-secondary font-mono">{score.address}</p>
          <span className="inline-block mt-1 rounded-full px-2.5 py-0.5 text-xs font-medium border border-border bg-surface">
            {score.chainName}
          </span>
        </div>
        <span
          className="rounded-full px-3 py-1 text-sm font-bold"
          style={{
            backgroundColor: `${score.recommendationColor}20`,
            color: score.recommendationColor,
          }}
        >
          {score.recommendation}
        </span>
      </div>

      {/* Score gauge */}
      <div className="flex items-center gap-8 mb-6">
        <div className="relative w-28 h-28 flex-shrink-0">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="#262626" strokeWidth="8" />
            <circle
              cx="50" cy="50" r="45" fill="none"
              stroke={score.recommendationColor}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className="transition-all duration-1000 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold">{score.score}</span>
            <span className="text-xs text-text-secondary">/ {score.maxScore}</span>
          </div>
        </div>

        {/* Breakdown bars */}
        <div className="flex-1 space-y-3">
          {score.breakdown.map((axis) => (
            <div key={axis.label}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-text-secondary">{axis.label}</span>
                <span>{axis.value}/{axis.max}</span>
              </div>
              <div className="h-2 rounded-full bg-border overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${(axis.value / axis.max) * 100}%`,
                    backgroundColor: score.recommendationColor,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Flags */}
      {score.flags.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-medium text-text-secondary mb-2">Flags</h3>
          <div className="space-y-2">
            {score.flags.map((flag, i) => {
              const severityColors: Record<string, string> = {
                CRITICAL: "text-blocklist border-blocklist/30 bg-blocklist/10",
                HIGH: "text-caution border-caution/30 bg-caution/10",
                MEDIUM: "text-text-secondary border-border bg-surface",
                LOW: "text-text-secondary border-border bg-surface",
              };
              return (
                <div key={i} className={`rounded-lg border p-3 text-sm ${severityColors[flag.severity]}`}>
                  <span className="font-medium">[{flag.severity}]</span> {flag.description}
                  {flag.evidence && (
                    <p className="mt-1 text-xs opacity-70">{flag.evidence}</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <p className="text-sm text-text-secondary">{score.summary}</p>
      <p className="mt-2 text-xs text-text-secondary/50">
        Analyzed {new Date(score.timestamp).toLocaleString()}
      </p>
    </div>
  );
}
