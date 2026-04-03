"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { UITrustScore } from "@/lib/types";
import { ActivityProfile } from "./ActivityProfile";
import {
  type Recommendation,
  CHAIN_EXPLORER,
  RECOMMENDATION_COLOR,
  RECOMMENDATION_BADGE_CLASS,
  VERDICT_ICONS,
  AGENT_TYPE_META,
  BREAKDOWN_EXPLANATIONS,
  TREND_META,
  formatTimestamp,
  formatIntervalHours,
  netFlowSign,
  gasLabel,
  netFlowLabel,
  txSizeLabel,
  formatGasUI,
  useScrollReveal,
  AgentTypeShape,
  HumanWalletIndicator,
  CountUpNumber,
  ActivityHeatmap,
  BreakdownBar,
  FlagCard,
} from "./trustscore";
import { cleanProtocols, isSpamToken } from "@/lib/sanitize";

// ─── Types ──────────────────────────────────────────────────────────────────

interface TrustScoreCardProps {
  score: UITrustScore;
  badge?: "verified" | "detected" | "unclassified" | null;
  attestationTxHash?: string | null;
  chainResults?: readonly { chainId: string; txCount: number }[];
}

// ─── Score Ring Constants ───────────────────────────────────────────────────

const RING_SIZE = 176;
const RING_CENTER = 88;
const RING_RADIUS = 72;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const TICK_COUNT = 12;

// ─── Main Component ─────────────────────────────────────────────────────────

export function TrustScoreCard({ score, badge, attestationTxHash, chainResults }: TrustScoreCardProps) {
  const recommendation = score.recommendation as Recommendation;
  const strokeColor = RECOMMENDATION_COLOR[recommendation] ?? score.recommendationColor;
  const typeMeta = AGENT_TYPE_META[score.agentType] ?? AGENT_TYPE_META.UNKNOWN;
  const netSign = netFlowSign(score.financialSummary.netFlowETH);

  const [animated, setAnimated] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const revealKey = `${score.address}-${score.score}`;
  const r = revealed ? " visible" : "";

  useEffect(() => { setAnimated(false); }, [revealKey]);

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
    } catch { /* Clipboard API unavailable */ }
  }, [score.address]);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const strokeDashoffset = animated
    ? RING_CIRCUMFERENCE - (score.score / score.maxScore) * RING_CIRCUMFERENCE
    : RING_CIRCUMFERENCE;

  // Scroll-reveal refs
  const activityReveal = useScrollReveal([revealKey]);
  const operationalReveal = useScrollReveal([revealKey]);
  const networkReveal = useScrollReveal([revealKey]);
  const behavioralReveal = useScrollReveal([revealKey]);
  const riskReveal = useScrollReveal([revealKey]);
  const funFactReveal = useScrollReveal([revealKey]);

  return (
    <div ref={cardRef} className="aa-result-stack" aria-label={`Trust score card for ${score.ensName ?? score.address}`}>

      {/* ═══ HERO ZONE ═══ */}
      <div className={`aa-card-hero aa-reveal${r}`}>
        <HeroIdentity
          score={score}
          typeMeta={typeMeta}
          recommendation={recommendation}
          badge={badge}
          attestationTxHash={attestationTxHash}
          copied={copied}
          onCopy={handleCopy}
        />

        <ScoreRing
          score={score.score}
          maxScore={score.maxScore}
          strokeColor={strokeColor}
          animated={animated}
          strokeDashoffset={strokeDashoffset}
          performanceScore={score.performanceScore}
        />

        <p className="aa-score-timestamp">{formatTimestamp(score.timestamp)}</p>

        <HeroSummary summary={score.summary} timestamp={score.timestamp} />

        <HumanWalletIndicator isHuman={score.isLikelyHumanWallet} />

        {chainResults && chainResults.length > 1 && (
          <MultiChainInfo chainResults={chainResults} />
        )}
      </div>

      {/* ═══ PRIMARY GRID: Breakdown + Financial ═══ */}
      <div className="aa-primary-grid">
        <ScoreBreakdown
          breakdown={score.breakdown}
          strokeColor={strokeColor}
          animated={animated}
          revealed={r}
        />
        <FinancialIntel
          financialSummary={score.financialSummary}
          netSign={netSign}
          ethPrice={score.ethPrice}
          balanceTrend={score.balanceTrend}
          avgGasPerTx={score.avgGasPerTx}
          revealed={r}
        />
      </div>

      {/* ═══ ACTIVITY PROFILE ═══ */}
      {(score.activityProfile || score.behavioralNarrative) && (
        <div ref={activityReveal} className="aa-card-secondary" aria-label="Activity profile">
          <p className="aa-section-title">
            {score.activityProfile ? "Activity Profile" : "Behavioral Analysis"}
          </p>
          <ActivityProfile
            profile={score.activityProfile}
            narrativeFallback={score.behavioralNarrative}
          />
        </div>
      )}

      {/* ═══ OPERATIONAL ═══ */}
      <div ref={operationalReveal} className="aa-card-secondary" aria-label="Operational pattern">
        <p className="aa-section-title">Operational Pattern</p>
        <OperationalStats
          operationalPattern={score.operationalPattern}
          avgGasPerTx={score.avgGasPerTx}
          txFrequencyPerDay={score.txFrequencyPerDay}
        />
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

      {/* ═══ NETWORK ═══ */}
      {hasNetworkData(score) && (
        <div ref={networkReveal} className="aa-card-secondary" aria-label="Network analysis">
          <p className="aa-section-title">Network &amp; Counterparties</p>
          <NetworkSection score={score} />
        </div>
      )}

      {/* ═══ BEHAVIORAL INSIGHTS ═══ */}
      {score.behavioralProfile && (
        <div ref={behavioralReveal} className="aa-card-secondary" aria-label="Behavioral insights">
          <p className="aa-section-title">Behavioral Insights</p>
          <BehavioralInsights profile={score.behavioralProfile} />
        </div>
      )}

      {/* ═══ RISK SIGNALS ═══ */}
      {(score.flags.length > 0 || score.anomalies.length > 0) && (
        <div ref={riskReveal} className="aa-card-secondary" aria-label="Risk signals">
          <p className="aa-section-title">Risk Signals</p>
          {score.flags.length > 0 && (
            <>
              <p className="aa-flags-label">Risk Flags: {score.flags.length} detected</p>
              <div className="aa-flags-list" role="list">
                {score.flags.map((flag, i) => (
                  <div key={i} className="aa-reveal" style={{ transitionDelay: `${i * 60}ms` }}>
                    <FlagCard flag={flag} />
                  </div>
                ))}
              </div>
            </>
          )}
          {score.anomalies.length > 0 && (
            <div className="aa-anomalies-section">
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
        </div>
      )}

      {/* ═══ FUN FACT ═══ */}
      {score.funFact && (
        <div ref={funFactReveal} className="aa-funfact" aria-label="Agent fun fact">
          <p className="aa-funfact-label">Fun Fact</p>
          <p>{score.funFact}</p>
        </div>
      )}
    </div>
  );
}

// ─── Hero Identity ──────────────────────────────────────────────────────────

function HeroIdentity({
  score,
  typeMeta,
  recommendation,
  badge,
  attestationTxHash,
  copied,
  onCopy,
}: {
  score: UITrustScore;
  typeMeta: { label: string; color: string };
  recommendation: Recommendation;
  badge?: "verified" | "detected" | "unclassified" | null;
  attestationTxHash?: string | null;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="aa-hero-zone-identity">
      <div className="aa-identity-left">
        <div className="aa-identity-type-row">
          <AgentTypeShape type={score.agentType} />
          <span className="aa-agent-type-label" style={{ color: typeMeta.color }}>
            {typeMeta.label}
          </span>
        </div>

        {score.ensName && (
          <div className="aa-ens-name">{score.ensName}</div>
        )}

        <div className="aa-address-row">
          <button
            className="aa-copy-btn"
            onClick={onCopy}
            aria-label={copied ? "Copied!" : "Copy address"}
            title={copied ? "Copied!" : "Copy address"}
          >
            <span className="aa-address-mono">
              {score.address.slice(0, 6)}...{score.address.slice(-4)}
            </span>
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

        {cleanProtocols(score.protocolsUsed).length > 0 && (
          <div className="aa-protocol-tags">
            {cleanProtocols(score.protocolsUsed).slice(0, 5).map((protocol) => (
              <span key={protocol} className="aa-protocol-tag">{protocol}</span>
            ))}
          </div>
        )}
      </div>

      <div className="aa-identity-right">
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
        {attestationTxHash && (
          <a
            href={`${CHAIN_EXPLORER[score.chainId] ?? CHAIN_EXPLORER.ethereum}/tx/${attestationTxHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="aa-attestation-link"
          >
            Onchain attestation ↗
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Score Ring ─────────────────────────────────────────────────────────────

function ScoreRing({
  score,
  maxScore,
  strokeColor,
  animated,
  strokeDashoffset,
  performanceScore,
}: {
  score: number;
  maxScore: number;
  strokeColor: string;
  animated: boolean;
  strokeDashoffset: number;
  performanceScore: number;
}) {
  return (
    <div className="aa-hero-zone-score">
      <div
        className="aa-score-ring aa-score-ring--176"
        role="img"
        aria-label={`Trust score: ${score} out of ${maxScore}`}
      >
        <div className="aa-score-glow" style={{ "--glow-color": strokeColor } as React.CSSProperties} aria-hidden="true" />
        <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
          <circle cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS} fill="none" stroke="#1e1e22" strokeWidth="10" />
          {Array.from({ length: TICK_COUNT }, (_, i) => {
            const angle = (i / TICK_COUNT) * 360 - 90;
            const rad = (angle * Math.PI) / 180;
            const r1 = RING_RADIUS + 8;
            const r2 = RING_RADIUS + 12;
            return (
              <line
                key={i}
                x1={RING_CENTER + r1 * Math.cos(rad)}
                y1={RING_CENTER + r1 * Math.sin(rad)}
                x2={RING_CENTER + r2 * Math.cos(rad)}
                y2={RING_CENTER + r2 * Math.sin(rad)}
                stroke="#252529"
                strokeWidth="1.5"
              />
            );
          })}
          <circle
            cx={RING_CENTER} cy={RING_CENTER} r={RING_RADIUS}
            fill="none"
            stroke={strokeColor}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            className="aa-score-arc"
            style={{
              transition: animated ? "stroke-dashoffset 1.4s cubic-bezier(0.16, 1, 0.3, 1)" : "none",
              transformOrigin: "center",
              filter: `drop-shadow(0 0 6px ${strokeColor}66)`,
            }}
          />
        </svg>
        <div className="aa-score-number">
          {animated
            ? <CountUpNumber target={score} color={strokeColor} />
            : <span className="aa-score-val" style={{ color: strokeColor }}>0</span>
          }
          <span className="aa-score-label">/ {maxScore}</span>
        </div>
      </div>
      <p className="aa-perf-below-ring">
        Performance <span className="aa-perf-below-value">{performanceScore}/100</span>
      </p>
    </div>
  );
}

// ─── Hero Summary ───────────────────────────────────────────────────────────

function HeroSummary({ summary, timestamp }: { summary: string; timestamp: string }) {
  const paragraphs = summary.split(/\n\n+/).filter(Boolean);
  return (
    <div className="aa-hero-zone-summary">
      <p className="aa-summary-label">Analysis Summary</p>
      <div className="aa-summary-text">
        {paragraphs.map((p, i) => (
          <p key={i} className={i === paragraphs.length - 1 ? "aa-summary-watch" : undefined}>{p}</p>
        ))}
      </div>
      <p className="aa-summary-timestamp">Analyzed {formatTimestamp(timestamp)}</p>
    </div>
  );
}

// ─── Multi-Chain Info ───────────────────────────────────────────────────────

function MultiChainInfo({ chainResults }: { chainResults: readonly { chainId: string; txCount: number }[] }) {
  return (
    <div className="aa-multichain-info">
      <p className="aa-multichain-heading">Active on {chainResults.length} chains</p>
      {chainResults.map(c => (
        <div key={c.chainId} className="aa-multichain-row">
          <span className="aa-multichain-chain">{c.chainId}</span>
          <span className="aa-multichain-count">{c.txCount.toLocaleString()} txs</span>
        </div>
      ))}
    </div>
  );
}

// ─── Score Breakdown ────────────────────────────────────────────────────────

function ScoreBreakdown({
  breakdown,
  strokeColor,
  animated,
  revealed,
}: {
  breakdown: UITrustScore["breakdown"];
  strokeColor: string;
  animated: boolean;
  revealed: string;
}) {
  return (
    <div className={`aa-card-primary aa-reveal aa-delay-3${revealed}`} aria-label="Score breakdown">
      <p className="aa-section-title">Score Breakdown</p>

      <div className="aa-stats-grid-2x2">
        {breakdown.map((axis) => (
          <div key={axis.label} className="aa-stat-cell">
            <p className="aa-stat-cell-label">{axis.label}</p>
            <p className="aa-stat-cell-value">{axis.value}/{axis.max}</p>
          </div>
        ))}
      </div>

      <div className="aa-breakdown-bars" role="list">
        {breakdown.map((axis, i) => (
          <div key={axis.label} role="listitem">
            <BreakdownBar axis={axis} strokeColor={strokeColor} animated={animated} delay={i * 80} />
            {BREAKDOWN_EXPLANATIONS[axis.label] && (
              <p className="aa-breakdown-explanation">{BREAKDOWN_EXPLANATIONS[axis.label]}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Financial Intel ────────────────────────────────────────────────────────

function FinancialIntel({
  financialSummary,
  netSign,
  ethPrice,
  balanceTrend,
  avgGasPerTx,
  revealed,
}: {
  financialSummary: UITrustScore["financialSummary"];
  netSign: "positive" | "negative" | "neutral";
  ethPrice?: number;
  balanceTrend?: "accumulating" | "depleting" | "stable";
  avgGasPerTx?: number;
  revealed: string;
}) {
  const flow = netFlowLabel(parseFloat(financialSummary.netFlowETH || "0"));
  const netVal = parseFloat(financialSummary.netFlowETH || "0");

  return (
    <div className={`aa-card-primary aa-reveal aa-delay-3${revealed}`} aria-label="Financial intelligence">
      <p className="aa-section-title">Financial Intel</p>

      <div className="aa-financial-grid-2x2">
        {/* Gas Spent */}
        <div className="aa-stat-cell">
          <p className="aa-stat-cell-label">Gas Spent</p>
          <p className="aa-stat-cell-value">
            <span className="aa-eth-sym" aria-hidden="true">Ξ</span>
            {financialSummary.totalGasSpentETH}
          </p>
          <p className="aa-stat-cell-sub">{gasLabel(parseFloat(financialSummary.totalGasSpentETH || "0"))}</p>
          {ethPrice != null && (
            <p className="aa-stat-cell-sub">
              ~${(parseFloat(financialSummary.totalGasSpentETH || "0") * ethPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          )}
        </div>

        {/* Net Flow */}
        <div className="aa-stat-cell">
          <p className="aa-stat-cell-label">Net Flow</p>
          <p className={`aa-stat-cell-value aa-fin-flow--${netSign}`}>
            <span className="aa-eth-sym" aria-hidden="true">Ξ</span>
            {financialSummary.netFlowETH}
          </p>
          <p className="aa-stat-cell-sub" style={{ color: flow.color }}>
            {flow.arrow} {flow.text}
          </p>
          {ethPrice != null && (
            <p className="aa-stat-cell-sub">
              ~${(Math.abs(parseFloat(financialSummary.netFlowETH || "0")) * ethPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          )}
        </div>

        {/* Largest Tx */}
        <div className="aa-stat-cell">
          <p className="aa-stat-cell-label">Largest Tx</p>
          <p className="aa-stat-cell-value">
            <span className="aa-eth-sym" aria-hidden="true">Ξ</span>
            {financialSummary.largestSingleTxETH}
          </p>
          <p className="aa-stat-cell-sub">{txSizeLabel(parseFloat(financialSummary.largestSingleTxETH || "0"))}</p>
          {ethPrice != null && (
            <p className="aa-stat-cell-sub">
              ~${(parseFloat(financialSummary.largestSingleTxETH || "0") * ethPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </p>
          )}
        </div>

        {/* Balance Trend */}
        {balanceTrend ? (() => {
          const trend = TREND_META[balanceTrend];
          return (
            <div className="aa-stat-cell">
              <p className="aa-stat-cell-label">Balance Trend</p>
              <p className="aa-stat-cell-value aa-trend-value" style={{ color: trend.color }}>
                <span className="aa-trend-icon">{trend.icon}</span>
                {trend.label}
              </p>
              <p className="aa-stat-cell-sub">
                {balanceTrend === "accumulating"
                  ? `Growing: net +${Math.abs(netVal).toFixed(4)} ETH inflow`
                  : balanceTrend === "depleting"
                  ? `Shrinking: net ${netVal.toFixed(4)} ETH outflow`
                  : "Holding steady, balanced in/out flows"}
              </p>
              {avgGasPerTx != null && (
                <p className="aa-stat-cell-sub">Avg gas cost: {formatGasUI(avgGasPerTx)} gas/tx</p>
              )}
            </div>
          );
        })() : (
          <div className="aa-stat-cell">
            <p className="aa-stat-cell-label">Balance Trend</p>
            <p className="aa-stat-cell-value aa-stat-cell-sub">N/A</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Operational Stats ──────────────────────────────────────────────────────

function OperationalStats({
  operationalPattern,
  avgGasPerTx,
  txFrequencyPerDay,
}: {
  operationalPattern: UITrustScore["operationalPattern"];
  avgGasPerTx?: number;
  txFrequencyPerDay?: number;
}) {
  const raw = operationalPattern.consistencyScore;
  const pct = raw <= 1 ? raw * 100 : raw;

  return (
    <div className="aa-operational-grid">
      <div className="aa-op-item">
        <span className="aa-op-label">Cadence</span>
        <span className="aa-op-value">{formatIntervalHours(operationalPattern.avgIntervalHours)}</span>
      </div>
      <div className="aa-op-item">
        <span className="aa-op-label">Consistency</span>
        <div className="aa-consistency-wrap">
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
        </div>
      </div>
      {avgGasPerTx != null && (
        <div className="aa-op-item">
          <span className="aa-op-label">Gas/Tx</span>
          <span className="aa-op-value">{formatGasUI(avgGasPerTx)}</span>
          <span className="aa-op-sub">
            {avgGasPerTx < 50_000 ? "Simple transfers"
              : avgGasPerTx < 150_000 ? "Standard DeFi ops"
              : avgGasPerTx < 500_000 ? "Complex interactions"
              : "Heavy computation"}
          </span>
        </div>
      )}
      {txFrequencyPerDay != null && (
        <div className="aa-op-item">
          <span className="aa-op-label">Tx/Day</span>
          <span className="aa-op-value">{txFrequencyPerDay.toFixed(1)}</span>
          <span className="aa-op-sub">
            {txFrequencyPerDay < 1 ? "Infrequent operator"
              : txFrequencyPerDay < 5 ? "Moderate activity"
              : txFrequencyPerDay < 20 ? "Active operator"
              : "High-frequency bot"}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Network Section ────────────────────────────────────────────────────────

function hasNetworkData(score: UITrustScore): boolean {
  return (
    score.uniqueCounterparties != null ||
    (score.nonceGaps != null && score.nonceGaps > 0) ||
    (score.mostCalledContracts != null && score.mostCalledContracts.length > 0) ||
    score.protocolsUsed.length > 0
  );
}

function NetworkSection({ score }: { score: UITrustScore }) {
  return (
    <>
      <div className="aa-operational-grid">
        {score.uniqueCounterparties != null && (
          <div className="aa-op-item">
            <span className="aa-op-label">Unique Counterparties</span>
            <span className="aa-op-value">{score.uniqueCounterparties.toLocaleString()}</span>
            <span className="aa-op-sub">
              {score.uniqueCounterparties <= 3 ? "Narrow network, few contracts"
                : score.uniqueCounterparties <= 10 ? "Focused operator, targeted contracts"
                : score.uniqueCounterparties <= 30 ? "Diverse network, multi-protocol"
                : "Wide reach, interacts broadly"}
            </span>
          </div>
        )}
        {score.nonceGaps != null && score.nonceGaps > 0 && (
          <div className="aa-op-item">
            <span className="aa-op-label">Nonce Gaps</span>
            <span className="aa-op-value aa-nonce-warn">{score.nonceGaps}</span>
            <span className="aa-op-sub aa-nonce-warn">
              {score.nonceGaps === 1 ? "Minor gap, likely a dropped tx"
                : score.nonceGaps <= 3 ? "Some gaps, possible tx replacements"
                : "Multiple gaps: unusual, may indicate MEV or tx manipulation"}
            </span>
          </div>
        )}
        {score.nonceGaps != null && score.nonceGaps === 0 && (
          <div className="aa-op-item">
            <span className="aa-op-label">Nonce Gaps</span>
            <span className="aa-op-value aa-nonce-clean">0</span>
            <span className="aa-op-sub">Clean sequence, no dropped transactions</span>
          </div>
        )}
      </div>

      {score.mostCalledContracts && score.mostCalledContracts.length > 0 && (
        <div className="aa-frequented-contracts">
          <p className="aa-frequented-heading">Most Frequented Contracts</p>
          <div className="aa-frequented-list">
            {score.mostCalledContracts.slice(0, 5).map((addr, i) => (
              <div key={addr} className={`aa-frequented-item${i === 0 ? " aa-frequented-item--primary" : ""}`}>
                <span className="aa-frequented-rank">#{i + 1}</span>
                <span className="aa-frequented-addr" title={addr}>
                  {addr.slice(0, 10)}...{addr.slice(-6)}
                </span>
                {i === 0 && <span className="aa-frequented-badge">Primary</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {cleanProtocols(score.protocolsUsed).length > 0 && (
        <div className="aa-protocol-fingerprint">
          <p className="aa-frequented-heading">Protocol Fingerprint</p>
          <div className="aa-protocols-scroll" role="list" aria-label="Protocols list">
            {cleanProtocols(score.protocolsUsed).map((protocol, i) => (
              <span key={protocol} className="aa-protocol-chip" role="listitem" style={{ animationDelay: `${i * 40}ms` }}>
                {protocol}
              </span>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Behavioral Insights ────────────────────────────────────────────────────

function BehavioralInsights({
  profile,
}: {
  profile: NonNullable<UITrustScore["behavioralProfile"]>;
}) {
  return (
    <>
      {/* Life Events */}
      {profile.lifeEvents.length > 0 && (
        <div className="aa-life-events">
          <p className="aa-section-heading">Life Events</p>
          <div className="aa-timeline">
            {profile.lifeEvents.map((event, i) => (
              <div key={i} className={`aa-timeline-item aa-event-${event.type}`}>
                <span className="aa-event-date">{event.date}</span>
                <span className="aa-event-desc">{event.description}</span>
                {event.value && <span className="aa-event-value">{event.value}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Breakdown */}
      {profile.activityBreakdown.length > 0 && (
        <div className="aa-activity-breakdown">
          <p className="aa-section-heading">Activity Breakdown</p>
          {profile.activityBreakdown.map((cat, i) => (
            <div key={i} className="aa-activity-bar">
              <div className="aa-activity-label">
                <span>{cat.category.replace(/_/g, " ")}</span>
                <span>{cat.percentage}% ({cat.txCount} txs)</span>
              </div>
              <div className="aa-bar-track">
                <div className="aa-bar-fill" style={{ width: `${cat.percentage}%` }} />
              </div>
              {cleanProtocols(cat.protocols).length > 0 && (
                <span className="aa-activity-protocols">{cleanProtocols(cat.protocols).join(", ")}</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Top Counterparties */}
      {profile.topCounterparties.length > 0 && (
        <div className="aa-top-counterparties">
          <p className="aa-section-heading">Top Counterparties</p>
          {profile.topCounterparties.map((cp, i) => (
            <div key={i} className="aa-counterparty-row">
              <span className="aa-cp-rank">#{i + 1}</span>
              <span className="aa-cp-name">{cp.name ?? `${cp.address.slice(0, 10)}...`}</span>
              <span className="aa-cp-stats">{cp.txCount} txs · {cp.volumeETH} ETH</span>
              <span className={`aa-cp-direction aa-dir-${cp.direction}`}>
                {cp.direction.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Token Flow + Timezone side by side */}
      <div className="aa-insights-pair">
        {profile.tokenFlowSummary.uniqueTokens > 0 && (
          <div className="aa-insights-cell">
            <p className="aa-section-heading">Token Flow</p>
            <div className="aa-insights-detail">
              {profile.tokenFlowSummary.dominantToken && !isSpamToken(profile.tokenFlowSummary.dominantToken.symbol) && (
                <span>Dominant: <strong>{profile.tokenFlowSummary.dominantToken.symbol}</strong> ({profile.tokenFlowSummary.dominantToken.txCount} txs)</span>
              )}
              <span>Unique tokens: {profile.tokenFlowSummary.uniqueTokens}</span>
              <span>Net direction: {profile.tokenFlowSummary.netDirection}</span>
              {profile.tokenFlowSummary.topTokens.filter(t => !isSpamToken(t.symbol)).length > 1 && (
                <span>Top: {profile.tokenFlowSummary.topTokens.filter(t => !isSpamToken(t.symbol)).slice(0, 3).map(t => t.symbol).join(", ")}</span>
              )}
            </div>
          </div>
        )}
        {profile.timezoneFingerprint.peakWindowUTC !== "N/A" && (
          <div className="aa-insights-cell">
            <p className="aa-section-heading">Timezone Fingerprint</p>
            <div className="aa-insights-detail">
              <span>Peak: <strong>{profile.timezoneFingerprint.peakWindowUTC}</strong> UTC</span>
              <span>Dead zone: {profile.timezoneFingerprint.deadZoneUTC} UTC</span>
              <span>{profile.timezoneFingerprint.is24x7 ? "24/7 bot operation" : profile.timezoneFingerprint.inference}</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
