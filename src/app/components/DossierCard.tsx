"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { DirectoryAgent, ChainId } from "@/lib/types";

interface DossierCardProps {
  readonly agent: DirectoryAgent;
  readonly index: number;
  readonly onSelect: (address: string, chainId: ChainId) => void;
}

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const EXPAND_DURATION = 250;

function scoreColor(score: number): string {
  if (score > 80) return "#22c55e";
  if (score > 60) return "#eab308";
  if (score > 40) return "#f97316";
  return "#ef4444";
}

function trustPillVariant(rec: "SAFE" | "CAUTION" | "BLOCKLIST"): string {
  if (rec === "SAFE") return "aa-dossier-trust-pill--safe";
  if (rec === "CAUTION") return "aa-dossier-trust-pill--caution";
  return "aa-dossier-trust-pill--blocklist";
}

function formatPeakHours(hours: readonly number[]): string {
  if (hours.length === 0) return "—";
  const min = Math.min(...hours);
  const max = Math.max(...hours);
  return `${min}–${max} UTC`;
}

function netFlowColor(netFlow: string): string {
  const val = parseFloat(netFlow);
  if (val > 0) return "#22c55e";
  if (val < 0) return "#ef4444";
  return "var(--color-text-secondary)";
}

function ScoreRing({ score }: { readonly score: number }) {
  const circumference = Math.PI * 2 * 14;
  const filled = (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <svg width="36" height="36" viewBox="0 0 36 36" aria-hidden="true" className="aa-dossier-score-ring">
      <circle cx="18" cy="18" r="14" fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
      <circle
        cx="18" cy="18" r="14"
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={`${filled} ${circumference - filled}`}
        strokeDashoffset={circumference * 0.25}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
      <text
        x="18" y="20" textAnchor="middle"
        fill="var(--color-text-primary)"
        fontSize="10" fontFamily="'JetBrains Mono', monospace" fontWeight="700"
      >
        {score}
      </text>
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DossierCard({ agent, index, onSelect }: DossierCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const expandRef = useRef<HTMLDivElement>(null);
  const chevronRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const animatingRef = useRef(false);

  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: 300, delay: index * 40, easing: EASING, fill: "forwards" },
    );
  }, [index]);

  const toggleExpand = useCallback(() => {
    const expandEl = expandRef.current;
    const chevronEl = chevronRef.current;
    if (!expandEl || !chevronEl || animatingRef.current) return;

    animatingRef.current = true;
    const inner = expandEl.firstElementChild as HTMLElement;
    const targetHeight = inner.scrollHeight;

    if (!expanded) {
      setExpanded(true);
      expandEl.style.overflow = "hidden";

      const anim = expandEl.animate(
        [
          { maxHeight: "0px", opacity: 0 },
          { maxHeight: `${targetHeight}px`, opacity: 1 },
        ],
        { duration: EXPAND_DURATION, easing: EASING, fill: "forwards" },
      );
      chevronEl.animate(
        [{ transform: "rotate(0deg)" }, { transform: "rotate(180deg)" }],
        { duration: EXPAND_DURATION, easing: EASING, fill: "forwards" },
      );
      anim.onfinish = () => {
        expandEl.style.overflow = "";
        animatingRef.current = false;
      };
    } else {
      expandEl.style.overflow = "hidden";

      const anim = expandEl.animate(
        [
          { maxHeight: `${targetHeight}px`, opacity: 1 },
          { maxHeight: "0px", opacity: 0 },
        ],
        { duration: EXPAND_DURATION, easing: EASING, fill: "forwards" },
      );
      chevronEl.animate(
        [{ transform: "rotate(180deg)" }, { transform: "rotate(0deg)" }],
        { duration: EXPAND_DURATION, easing: EASING, fill: "forwards" },
      );
      anim.onfinish = () => {
        setExpanded(false);
        expandEl.style.overflow = "";
        animatingRef.current = false;
      };
    }
  }, [expanded]);

  const hasAnomalies = agent.anomalies.length > 0;

  return (
    <div
      ref={cardRef}
      className={`aa-dossier${expanded ? " aa-dossier--expanded" : ""}`}
      style={{ opacity: 0 }}
    >
      {/* Collapsed Header Row */}
      <div
        className="aa-dossier-header"
        onClick={toggleExpand}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(); } }}
        aria-expanded={expanded}
        aria-label={`${agent.name} — score ${agent.score}`}
      >
        <ScoreRing score={agent.score} />

        <span className="aa-dossier-name">{agent.name}</span>

        <span className="aa-dossier-chain-pill">{agent.chainId}</span>

        {hasAnomalies ? (
          <span className={`aa-dossier-anomaly aa-dossier-anomaly--${agent.recommendation === "BLOCKLIST" ? "danger" : "caution"}`}>
            <span aria-hidden="true">{agent.recommendation === "BLOCKLIST" ? "◆" : "▲"}</span>
            {agent.anomalies[0].length > 30 ? agent.anomalies[0].slice(0, 30) + "…" : agent.anomalies[0]}
          </span>
        ) : (
          <span className={`aa-dossier-trust-pill ${trustPillVariant(agent.recommendation)}`}>
            {agent.recommendation}
          </span>
        )}

        <span ref={chevronRef} className="aa-dossier-chevron">
          <ChevronIcon />
        </span>
      </div>

      {/* Expandable Detail Panel */}
      <div
        ref={expandRef}
        className="aa-dossier-expand"
        style={expanded ? undefined : { maxHeight: 0, opacity: 0, overflow: "hidden" }}
      >
        <div className="aa-dossier-expand-inner">
          <p className="aa-dossier-narrative">{agent.behavioralNarrative}</p>

          {agent.funFact && (
            <p className="aa-dossier-funfact">{agent.funFact}</p>
          )}

          <div className="aa-dossier-fin-grid">
            <div>
              <span className="aa-dossier-fin-label">Gas Burned</span>
              <span className="aa-dossier-fin-value">{agent.financialSummary.totalGasSpentETH} ETH</span>
            </div>
            <div>
              <span className="aa-dossier-fin-label">Net Flow</span>
              <span className="aa-dossier-fin-value" style={{ color: netFlowColor(agent.financialSummary.netFlowETH) }}>
                {agent.financialSummary.netFlowETH} ETH
              </span>
            </div>
            <div>
              <span className="aa-dossier-fin-label">Peak Hours</span>
              <span className="aa-dossier-fin-value">{formatPeakHours(agent.operationalPattern.peakHoursUTC)}</span>
            </div>
            <div>
              <span className="aa-dossier-fin-label">Consistency</span>
              <span className="aa-dossier-fin-value">{Math.round(agent.operationalPattern.consistencyScore * 100)}%</span>
            </div>
          </div>

          {agent.protocolsUsed.length > 0 && (
            <div className="aa-dossier-protocols">
              {agent.protocolsUsed.map((p) => (
                <span key={p} className="aa-dossier-chip">{p}</span>
              ))}
            </div>
          )}

          {hasAnomalies && (
            <div className="aa-dossier-anomaly-details">
              {agent.anomalies.map((a) => (
                <span key={a} className={`aa-dossier-anomaly aa-dossier-anomaly--${agent.recommendation === "BLOCKLIST" ? "danger" : "caution"}`}>
                  <span aria-hidden="true">⚠</span> {a}
                </span>
              ))}
            </div>
          )}

          <div className="aa-dossier-actions">
            <button
              className="aa-dossier-audit-btn"
              onClick={(e) => { e.stopPropagation(); onSelect(agent.address, agent.chainId); }}
            >
              Run Full Audit →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
