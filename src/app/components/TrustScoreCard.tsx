"use client";

import { useEffect, useRef, useState } from "react";
import type { UITrustScore, TrustFlag } from "@/lib/types";

interface TrustScoreCardProps {
  score: UITrustScore;
}

type Recommendation = "SAFE" | "CAUTION" | "BLOCKLIST";

const RECOMMENDATION_COLOR: Record<Recommendation, string> = {
  SAFE: "#22c55e",
  CAUTION: "#eab308",
  BLOCKLIST: "#ef4444",
};

const RECOMMENDATION_BADGE_CLASS: Record<Recommendation, string> = {
  SAFE: "aa-badge-pill aa-badge-safe",
  CAUTION: "aa-badge-pill aa-badge-caution",
  BLOCKLIST: "aa-badge-pill aa-badge-blocklist",
};

function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function FlagCard({ flag }: { flag: TrustFlag }) {
  const severityClass: Record<TrustFlag["severity"], string> = {
    CRITICAL: "aa-flag-card aa-flag-critical",
    HIGH: "aa-flag-card aa-flag-high",
    MEDIUM: "aa-flag-card aa-flag-medium",
    LOW: "aa-flag-card aa-flag-low",
  };

  const badgeClass: Record<TrustFlag["severity"], string> = {
    CRITICAL: "aa-severity-badge aa-severity-critical",
    HIGH: "aa-severity-badge aa-severity-high",
    MEDIUM: "aa-severity-badge aa-severity-medium",
    LOW: "aa-severity-badge aa-severity-low",
  };

  return (
    <div className={severityClass[flag.severity]} role="listitem">
      <span className={badgeClass[flag.severity]} aria-label={`Severity: ${flag.severity}`}>
        {flag.severity}
      </span>
      <div>
        <p className="aa-flag-desc">{flag.description}</p>
        {flag.evidence && (
          <p className="aa-flag-evidence" aria-label="Evidence">
            {flag.evidence}
          </p>
        )}
      </div>
    </div>
  );
}

export function TrustScoreCard({ score }: TrustScoreCardProps) {
  const circumference = 2 * Math.PI * 60;
  const recommendation = score.recommendation as Recommendation;
  const strokeColor = RECOMMENDATION_COLOR[recommendation] ?? score.recommendationColor;

  const [animated, setAnimated] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setAnimated(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const strokeDashoffset = animated
    ? circumference - (score.score / score.maxScore) * circumference
    : circumference;

  return (
    <div ref={cardRef} aria-label={`Trust score card for ${score.address}`}>
      {/* Agent header */}
      <div className="aa-agent-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <span className="aa-agent-address" aria-label="Agent address">
            {truncateAddress(score.address)}
          </span>
          <span className="aa-badge-pill aa-badge-chain" aria-label={`Chain: ${score.chainName}`}>
            {score.chainName}
          </span>
        </div>
        <span
          className={RECOMMENDATION_BADGE_CLASS[recommendation]}
          aria-label={`Recommendation: ${recommendation}`}
        >
          {recommendation}
        </span>
      </div>

      {/* Score ring + left content */}
      <div className="aa-score-section">
        {/* Left: empty — content flows in summary block below */}
        <div>
          <p style={{ fontSize: "0.65rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "#5a5650", marginBottom: "0.35rem" }}>
            Trust Score
          </p>
          <p style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "clamp(1.1rem, 2vw, 1.4rem)", fontWeight: 600, color: "#e8e5df", letterSpacing: "-0.02em", lineHeight: 1.3 }}>
            Forensic Analysis Report
          </p>
          <p style={{ fontSize: "0.8125rem", color: "#8f8a82", marginTop: "0.35rem" }}>
            {score.chainName} · {new Date(score.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>

        {/* Right: Score ring */}
        <div className="aa-score-ring-wrap">
          <div
            className="aa-score-ring"
            role="img"
            aria-label={`Trust score: ${score.score} out of ${score.maxScore}`}
          >
            <svg width="140" height="140" viewBox="0 0 140 140" aria-hidden="true">
              <circle
                cx="70"
                cy="70"
                r="60"
                fill="none"
                stroke="#252529"
                strokeWidth="8"
              />
              <circle
                cx="70"
                cy="70"
                r="60"
                fill="none"
                stroke={strokeColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{
                  transition: animated ? "stroke-dashoffset 1.2s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
                  transform: "rotate(-90deg)",
                  transformOrigin: "center",
                }}
              />
            </svg>
            <div className="aa-score-number">
              <span className="aa-score-val" style={{ color: strokeColor }}>
                {score.score}
              </span>
              <span className="aa-score-label">/ {score.maxScore}</span>
            </div>
          </div>
          <p style={{ fontSize: "0.7rem", color: "#5a5650", textAlign: "center", marginTop: "0.25rem", fontFamily: "'JetBrains Mono', monospace" }}>
            {new Date(score.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>

      {/* 1. Summary — human-readable verdict */}
      <div className="aa-summary-block" aria-label="Analysis summary">
        <p className="aa-summary-label">Analysis Summary</p>
        <p className="aa-summary-text">{score.summary}</p>
        <p className="aa-timestamp">
          Analyzed {new Date(score.timestamp).toLocaleString()}
        </p>
      </div>

      {/* 2. Breakdown bars */}
      <div className="aa-breakdown-card" aria-label="Score breakdown">
        <p className="aa-section-heading">Score Breakdown</p>
        <div className="aa-breakdown-grid" role="list">
          {score.breakdown.map((axis) => {
            const pct = (axis.value / axis.max) * 100;
            return (
              <div key={axis.label} role="listitem">
                <div className="aa-breakdown-label">
                  <span>{axis.label}</span>
                  <span className="aa-breakdown-score" aria-label={`${axis.value} out of ${axis.max}`}>
                    {axis.value}/{axis.max}
                  </span>
                </div>
                <div className="aa-bar-track" role="progressbar" aria-valuenow={axis.value} aria-valuemin={0} aria-valuemax={axis.max}>
                  <div
                    className="aa-bar-fill"
                    style={{
                      width: animated ? `${pct}%` : "0%",
                      backgroundColor: strokeColor,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Risk flags */}
      {score.flags.length > 0 && (
        <div className="aa-flags-section" aria-label="Risk flags">
          <p className="aa-flags-label">Risk Signals — {score.flags.length} detected</p>
          <div className="aa-flags-list" role="list">
            {score.flags.map((flag, i) => (
              <FlagCard key={i} flag={flag} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
