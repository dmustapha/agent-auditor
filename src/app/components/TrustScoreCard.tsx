"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { UITrustScore, TrustFlag, AgentType } from "@/lib/types";

// ─── Constants ────────────────────────────────────────────────────────────────

interface TrustScoreCardProps {
  score: UITrustScore;
  badge?: "verified" | "detected" | "unclassified" | null;
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

const VERDICT_ICONS: Record<Recommendation, React.ReactNode> = {
  SAFE: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  ),
  CAUTION: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  ),
  BLOCKLIST: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" />
    </svg>
  ),
};

const AGENT_TYPE_META: Record<AgentType, { label: string; shape: string; color: string }> = {
  KEEPER:         { label: "Keeper",         shape: "hexagon",  color: "#9070d4" },
  ORACLE:         { label: "Oracle",         shape: "diamond",  color: "#60a5fa" },
  LIQUIDATOR:     { label: "Liquidator",     shape: "triangle", color: "#f97316" },
  MEV_BOT:        { label: "MEV Bot",        shape: "star",     color: "#ef4444" },
  BRIDGE_RELAYER: { label: "Bridge Relayer", shape: "octagon",  color: "#22c55e" },
  DEX_TRADER:      { label: "DEX Trader",      shape: "pentagon", color: "#eab308" },
  GOVERNANCE:      { label: "Governance",      shape: "shield",   color: "#60a5fa" },
  YIELD_OPTIMIZER: { label: "Yield Optimizer", shape: "gear",     color: "#34d399" },
  UNKNOWN:         { label: "Unknown",         shape: "circle",   color: "#78716c" },
};

const SEVERITY_SHAPE: Record<TrustFlag["severity"], string> = {
  CRITICAL: "aa-sev-diamond",
  HIGH:     "aa-sev-triangle",
  MEDIUM:   "aa-sev-square",
  LOW:      "aa-sev-circle",
};

const FLAG_CARD_CLASS: Record<TrustFlag["severity"], string> = {
  CRITICAL: "aa-flag-card aa-flag-critical",
  HIGH:     "aa-flag-card aa-flag-high",
  MEDIUM:   "aa-flag-card aa-flag-medium",
  LOW:      "aa-flag-card aa-flag-low",
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatIntervalHours(hours: number): string {
  if (hours < 1) return `every ${Math.round(hours * 60)}m`;
  if (hours < 24) return `every ${hours % 1 === 0 ? hours : hours.toFixed(1)}h`;
  const days = hours / 24;
  return `every ${days % 1 === 0 ? days : days.toFixed(1)}d`;
}

function netFlowSign(val: string): "positive" | "negative" | "neutral" {
  const n = parseFloat(val);
  if (n > 0) return "positive";
  if (n < 0) return "negative";
  return "neutral";
}

// ─── WAAPI Helpers ────────────────────────────────────────────────────────────

const SPRING_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

function animateIn(el: Element, delay = 0): Animation {
  return el.animate(
    [
      { opacity: "0", transform: "translateY(24px) scale(0.98)" },
      { opacity: "1", transform: "translateY(0) scale(1)" },
    ],
    { duration: 500, delay, easing: SPRING_EASING, fill: "forwards" }
  );
}

function useScrollReveal(deps: unknown[]): React.RefCallback<HTMLElement> {
  return useCallback((el: HTMLElement | null) => {
    if (!el) return;
    el.style.opacity = "0";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          animateIn(el);
          observer.disconnect();
        }
      },
      { threshold: 0.08 }
    );
    observer.observe(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AgentTypeShape({ type }: { type: AgentType }) {
  const meta = AGENT_TYPE_META[type];
  const size = 28;

  const shapes: Record<string, React.ReactNode> = {
    hexagon: (
      <polygon
        points="14,2 25,8 25,20 14,26 3,20 3,8"
        fill="none"
        stroke={meta.color}
        strokeWidth="1.5"
      />
    ),
    diamond: (
      <polygon
        points="14,2 26,14 14,26 2,14"
        fill="none"
        stroke={meta.color}
        strokeWidth="1.5"
      />
    ),
    triangle: (
      <polygon
        points="14,3 26,25 2,25"
        fill="none"
        stroke={meta.color}
        strokeWidth="1.5"
      />
    ),
    star: (
      <polygon
        points="14,2 17,10 26,10 19,16 22,25 14,19 6,25 9,16 2,10 11,10"
        fill="none"
        stroke={meta.color}
        strokeWidth="1.5"
      />
    ),
    octagon: (
      <polygon
        points="9,2 19,2 26,9 26,19 19,26 9,26 2,19 2,9"
        fill="none"
        stroke={meta.color}
        strokeWidth="1.5"
      />
    ),
    pentagon: (
      <polygon
        points="14,2 26,10 21,24 7,24 2,10"
        fill="none"
        stroke={meta.color}
        strokeWidth="1.5"
      />
    ),
    circle: (
      <circle cx="14" cy="14" r="11" fill="none" stroke={meta.color} strokeWidth="1.5" />
    ),
    shield: (
      <path
        d="M14 2L4 6v7c0 5.5 4.4 9.7 10 11 5.6-1.3 10-5.5 10-11V6L14 2z"
        fill="none"
        stroke={meta.color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    ),
    gear: (
      <polygon
        points="14,3 16,7 20,5 22,9 18,12 20,16 16,18 14,25 12,18 8,16 10,12 6,9 8,5 12,7"
        fill="none"
        stroke={meta.color}
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    ),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ filter: `drop-shadow(0 0 4px ${meta.color}55)` }}
    >
      {shapes[meta.shape]}
    </svg>
  );
}

function SeverityShape({ severity }: { severity: TrustFlag["severity"] }) {
  const shapes: Record<TrustFlag["severity"], React.ReactNode> = {
    CRITICAL: (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <polygon points="7,1 13,13 1,13" fill="none" stroke="#ef4444" strokeWidth="1.5" />
      </svg>
    ),
    HIGH: (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <polygon points="7,1 13,7 7,13 1,7" fill="none" stroke="#eab308" strokeWidth="1.5" />
      </svg>
    ),
    MEDIUM: (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="2" y="2" width="10" height="10" fill="none" stroke="#9070d4" strokeWidth="1.5" />
      </svg>
    ),
    LOW: (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <circle cx="7" cy="7" r="5.5" fill="none" stroke="#78716c" strokeWidth="1.5" />
      </svg>
    ),
  };
  return <>{shapes[severity]}</>;
}

function HumanWalletIndicator({ isHuman }: { isHuman: boolean }) {
  if (!isHuman) return null;
  return (
    <div className="aa-human-wallet" role="alert" aria-label="Likely human-controlled wallet detected">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="1.75" aria-hidden="true">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
      <span>Likely human-controlled wallet</span>
    </div>
  );
}

function FlagCard({ flag }: { flag: TrustFlag }) {
  const [expanded, setExpanded] = useState(false);
  const hasLongEvidence = flag.evidence ? flag.evidence.length > 120 : false;

  return (
    <div className={FLAG_CARD_CLASS[flag.severity]} role="listitem">
      <div className="aa-flag-sev-shape" aria-label={`Severity: ${flag.severity}`}>
        <SeverityShape severity={flag.severity} />
        <span className={SEVERITY_SHAPE[flag.severity] + " aa-sev-label"}>{flag.severity}</span>
      </div>
      <div style={{ flex: 1 }}>
        <p className="aa-flag-desc">{flag.description}</p>
        {flag.evidence && (
          <div className="aa-flag-evidence-wrap">
            <p className={`aa-flag-evidence${!expanded && hasLongEvidence ? " aa-flag-evidence--clamped" : ""}`}>
              {flag.evidence}
            </p>
            {hasLongEvidence && (
              <button
                className="aa-flag-toggle"
                onClick={() => setExpanded(!expanded)}
                aria-expanded={expanded}
                aria-label={expanded ? "Show less evidence" : "Show more evidence"}
              >
                {expanded ? "Show less" : "Show more"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CountUpNumber({ target, color, duration = 1200 }: { target: number; color: string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      // cubic-bezier(0.16,1,0.3,1) approximation via ease-out-expo
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      setDisplay(Math.round(eased * target));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return <span className="aa-score-val" style={{ color }}>{display}</span>;
}

function ActivityHeatmap({ peakHours }: { peakHours: readonly number[] }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const peakSet = new Set(peakHours);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const cells = Array.from(grid.querySelectorAll<HTMLElement>(".aa-heatmap-cell"));
    const timers: ReturnType<typeof setTimeout>[] = [];
    cells.forEach((cell, i) => {
      cell.style.opacity = "0";
      timers.push(setTimeout(() => {
        cell.animate(
          [{ opacity: "0", transform: "scale(0.4)" }, { opacity: "1", transform: "scale(1)" }],
          { duration: 250, easing: SPRING_EASING, fill: "forwards" }
        );
      }, i * 30));
    });
    return () => timers.forEach(clearTimeout);
  }, [peakHours]);

  return (
    <div ref={gridRef} className="aa-heatmap" role="img" aria-label={`Peak activity hours UTC: ${peakHours.join(", ")}`}>
      {Array.from({ length: 24 }, (_, h) => (
        <div
          key={h}
          className={`aa-heatmap-cell${peakSet.has(h) ? " aa-heatmap-cell--peak" : ""}`}
          title={`${String(h).padStart(2, "0")}:00 UTC${peakSet.has(h) ? " — peak" : ""}`}
        />
      ))}
    </div>
  );
}

function BreakdownBar({
  axis,
  strokeColor,
  animated,
  delay,
}: {
  axis: { label: string; value: number; max: number };
  strokeColor: string;
  animated: boolean;
  delay: number;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const pct = (axis.value / axis.max) * 100;

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || !animated) return;
    bar.animate(
      [
        { width: "0%" },
        { width: `${pct * 1.05}%` },
        { width: `${pct}%` },
      ],
      { duration: 900, delay, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "forwards" }
    );
  }, [animated, pct, delay]);

  return (
    <div>
      <div className="aa-breakdown-label">
        <span>{axis.label}</span>
        <span className="aa-breakdown-score" aria-label={`${axis.value} out of ${axis.max}`}>
          {axis.value}/{axis.max}
        </span>
      </div>
      <div className="aa-bar-track" role="progressbar" aria-valuenow={axis.value} aria-valuemin={0} aria-valuemax={axis.max}>
        <div
          ref={barRef}
          className="aa-bar-fill"
          style={{ width: "0%", backgroundColor: strokeColor }}
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function TrustScoreCard({ score, badge }: TrustScoreCardProps) {
  const circumference = 2 * Math.PI * 60;
  const recommendation = score.recommendation as Recommendation;
  const strokeColor = RECOMMENDATION_COLOR[recommendation] ?? score.recommendationColor;

  const [animated, setAnimated] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined!);

  const revealKey = `${score.address}-${score.score}`;

  useEffect(() => {
    setAnimated(false);
  }, [revealKey]);

  useEffect(() => {
    setRevealed(false);
    const frame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setRevealed(true));
    });
    return () => cancelAnimationFrame(frame);
  }, [score.address]);

  useEffect(() => {
    if (animated) return;
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
  }, [revealKey, animated]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(score.address);
      setCopied(true);
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable
    }
  }, [score.address]);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const strokeDashoffset = animated
    ? circumference - (score.score / score.maxScore) * circumference
    : circumference;

  const r = revealed ? " visible" : "";

  // Scroll-reveal refs for new sections
  const narrativeReveal = useScrollReveal([revealKey]);
  const financialReveal = useScrollReveal([revealKey]);
  const operationalReveal = useScrollReveal([revealKey]);
  const protocolsReveal = useScrollReveal([revealKey]);
  const anomaliesReveal = useScrollReveal([revealKey]);
  const funFactReveal = useScrollReveal([revealKey]);

  const typeMeta = AGENT_TYPE_META[score.agentType];
  const netSign = netFlowSign(score.financialSummary.netFlowETH);

  return (
    <div ref={cardRef} aria-label={`Trust score card for ${score.address}`}>

      {/* ── Agent Header ── */}
      <div className={`aa-agent-header aa-reveal${r}`}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <button
            className="aa-copy-btn"
            onClick={handleCopy}
            aria-label={copied ? "Copied!" : "Copy address"}
            title={copied ? "Copied!" : "Copy address"}
          >
            <span className="aa-agent-address">{truncateAddress(score.address)}</span>
            {copied ? (
              <svg className="aa-copy-icon aa-copy-icon--done" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg className="aa-copy-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
            )}
          </button>
          <span className="aa-badge-pill aa-badge-chain" aria-label={`Chain: ${score.chainName}`}>
            {score.chainName}
          </span>
        </div>
        <span
          className={RECOMMENDATION_BADGE_CLASS[recommendation]}
          aria-label={`Recommendation: ${recommendation}`}
        >
          {VERDICT_ICONS[recommendation]}
          {recommendation}
        </span>
        {badge === "verified" && (
          <span className="aa-trust-badge aa-trust-badge--verified">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 16.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z"/></svg>
            Verified Agent
          </span>
        )}
        {badge === "detected" && (
          <span className="aa-trust-badge aa-trust-badge--detected">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="2"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/></svg>
            Detected Agent
          </span>
        )}
        {badge === "unclassified" && (
          <span className="aa-trust-badge aa-trust-badge--unclassified">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Unclassified
          </span>
        )}
      </div>

      {/* ── Agent Classification Panel ── */}
      <div className={`aa-classification-panel aa-reveal aa-delay-1${r}`} aria-label="Agent classification">
        <div className="aa-classification-left">
          <AgentTypeShape type={score.agentType} />
          <div>
            <p className="aa-classification-kicker">Agent Classification</p>
            <p className="aa-classification-type" style={{ color: typeMeta.color }}>
              {typeMeta.label}
            </p>
          </div>
        </div>
        <div className="aa-classification-right">
          <HumanWalletIndicator isHuman={score.isLikelyHumanWallet} />
          <div className="aa-perf-metric">
            <span className="aa-perf-label">Performance</span>
            <span className="aa-perf-value" aria-label={`Performance score: ${score.performanceScore} out of 100`}>
              {score.performanceScore}
              <span className="aa-perf-max">/100</span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Score Ring + Left Content ── */}
      <div className={`aa-score-section aa-reveal aa-delay-2${r}`}>
        <div>
          <p className="aa-score-eyebrow">Trust Score</p>
          <p className="aa-score-report-title">Forensic Analysis Report</p>
          <p className="aa-score-meta">
            {score.chainName} · {new Date(score.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </p>
        </div>

        <div className="aa-score-ring-wrap">
          <div
            className="aa-score-ring"
            role="img"
            aria-label={`Trust score: ${score.score} out of ${score.maxScore}`}
          >
            {/* Ambient glow layer */}
            <div className="aa-score-glow" style={{ "--glow-color": strokeColor } as React.CSSProperties} aria-hidden="true" />
            <svg width="152" height="152" viewBox="0 0 152 152" aria-hidden="true">
              {/* Track */}
              <circle cx="76" cy="76" r="64" fill="none" stroke="#1e1e22" strokeWidth="10" />
              {/* Tick marks */}
              {Array.from({ length: 12 }, (_, i) => {
                const angle = (i / 12) * 360 - 90;
                const rad = (angle * Math.PI) / 180;
                const r1 = 72, r2 = 76;
                return (
                  <line
                    key={i}
                    x1={76 + r1 * Math.cos(rad)}
                    y1={76 + r1 * Math.sin(rad)}
                    x2={76 + r2 * Math.cos(rad)}
                    y2={76 + r2 * Math.sin(rad)}
                    stroke="#252529"
                    strokeWidth="1.5"
                  />
                );
              })}
              {/* Score arc */}
              <circle
                cx="76" cy="76" r="64"
                fill="none"
                stroke={strokeColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                style={{
                  transition: animated ? "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
                  transform: "rotate(-90deg)",
                  transformOrigin: "center",
                  filter: `drop-shadow(0 0 6px ${strokeColor}66)`,
                }}
              />
            </svg>
            <div className="aa-score-number">
              {animated
                ? <CountUpNumber target={score.score} color={strokeColor} />
                : <span className="aa-score-val" style={{ color: strokeColor }}>0</span>
              }
              <span className="aa-score-label">/ {score.maxScore}</span>
            </div>
          </div>
          <p className="aa-score-timestamp">
            {new Date(score.timestamp).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
      </div>

      {/* ── Analysis Summary ── */}
      <div className={`aa-summary-block aa-reveal aa-delay-3${r}`} aria-label="Analysis summary">
        <p className="aa-summary-label">Analysis Summary</p>
        <p className="aa-summary-text">{score.summary}</p>
        <p className="aa-timestamp">Analyzed {new Date(score.timestamp).toLocaleString()}</p>
      </div>

      {/* ── Behavioral Narrative ── */}
      {score.behavioralNarrative && (
        <div
          ref={narrativeReveal}
          className="aa-narrative-block"
          aria-label="Behavioral narrative"
        >
          <p className="aa-narrative-kicker">Behavioral Analysis</p>
          <blockquote className="aa-narrative-text">{score.behavioralNarrative}</blockquote>
        </div>
      )}

      {/* ── Score Breakdown ── */}
      <div className={`aa-breakdown-card aa-reveal aa-delay-4${r}`} aria-label="Score breakdown">
        <p className="aa-section-heading">Score Breakdown</p>
        <div className="aa-breakdown-grid" role="list">
          {score.breakdown.map((axis, i) => (
            <div key={axis.label} role="listitem">
              <BreakdownBar
                axis={axis}
                strokeColor={strokeColor}
                animated={animated}
                delay={i * 80}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── Financial Intel ── */}
      <div ref={financialReveal} className="aa-financial-panel" aria-label="Financial intelligence">
        <p className="aa-section-heading">Financial Intel</p>
        <div className="aa-financial-grid">
          <div className="aa-fin-item">
            <span className="aa-fin-label">Gas Spent</span>
            <span className="aa-fin-value">
              <span className="aa-eth-sym" aria-hidden="true">Ξ</span>
              {score.financialSummary.totalGasSpentETH}
            </span>
          </div>
          <div className="aa-fin-item">
            <span className="aa-fin-label">Net Flow</span>
            <span className={`aa-fin-value aa-fin-flow--${netSign}`}>
              <span className="aa-eth-sym" aria-hidden="true">Ξ</span>
              {score.financialSummary.netFlowETH}
            </span>
          </div>
          <div className="aa-fin-item">
            <span className="aa-fin-label">Largest Tx</span>
            <span className="aa-fin-value">
              <span className="aa-eth-sym" aria-hidden="true">Ξ</span>
              {score.financialSummary.largestSingleTxETH}
            </span>
          </div>
        </div>
      </div>

      {/* ── Operational Pattern ── */}
      <div ref={operationalReveal} className="aa-operational-panel" aria-label="Operational pattern">
        <p className="aa-section-heading">Operational Pattern</p>
        <div className="aa-operational-grid">
          <div className="aa-op-item">
            <span className="aa-op-label">Cadence</span>
            <span className="aa-op-value">
              {formatIntervalHours(score.operationalPattern.avgIntervalHours)}
            </span>
          </div>
          <div className="aa-op-item">
            <span className="aa-op-label">Consistency</span>
            <div className="aa-consistency-wrap">
              {(() => {
                // API returns 0-1 decimal; normalize to 0-100
                const raw = score.operationalPattern.consistencyScore;
                const pct = raw <= 1 ? raw * 100 : raw;
                return (
                  <>
                    <div className="aa-consistency-track">
                      <div
                        className="aa-consistency-fill"
                        style={{ width: `${pct}%` }}
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      />
                    </div>
                    <span className="aa-op-pct">{Math.round(pct)}%</span>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
        <div className="aa-heatmap-wrap">
          <p className="aa-heatmap-label">24h Activity Map (UTC)</p>
          <ActivityHeatmap peakHours={score.operationalPattern.peakHoursUTC} />
          <div className="aa-heatmap-axis">
            {["0", "6", "12", "18", "23"].map((h) => (
              <span key={h}>{h}</span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Protocol Fingerprint ── */}
      {score.protocolsUsed.length > 0 && (
        <div ref={protocolsReveal} className="aa-protocols-panel" aria-label="Protocols used">
          <p className="aa-section-heading">Protocol Fingerprint</p>
          <div className="aa-protocols-scroll" role="list" aria-label="Protocols list">
            {score.protocolsUsed.map((protocol, i) => (
              <span
                key={protocol}
                className="aa-protocol-chip"
                role="listitem"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                {protocol}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Risk Flags ── */}
      {score.flags.length > 0 && (
        <div className={`aa-flags-section aa-reveal aa-delay-5${r}`} aria-label="Risk flags">
          <p className="aa-flags-label">Risk Signals — {score.flags.length} detected</p>
          <div className="aa-flags-list" role="list">
            {score.flags.map((flag, i) => (
              <div key={i} className="aa-reveal" style={{ transitionDelay: `${i * 60}ms` }}>
                <FlagCard flag={flag} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Anomaly Signals ── */}
      {score.anomalies.length > 0 && (
        <div ref={anomaliesReveal} className="aa-anomalies-panel" aria-label="Anomaly signals">
          <p className="aa-section-heading">
            Anomaly Signals
            <span className="aa-anomaly-count">{score.anomalies.length}</span>
          </p>
          <ul className="aa-anomaly-list" role="list">
            {score.anomalies.map((anomaly, i) => (
              <li key={i} className="aa-anomaly-item" role="listitem">
                <span className="aa-anomaly-marker" aria-hidden="true" />
                <span className="aa-anomaly-text">{anomaly}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Fun Fact ── */}
      {score.funFact && (
        <div ref={funFactReveal} className="aa-fun-fact" aria-label="Agent fun fact">
          <span className="aa-fun-fact-icon" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          </span>
          <p className="aa-fun-fact-text">{score.funFact}</p>
        </div>
      )}
    </div>
  );
}
