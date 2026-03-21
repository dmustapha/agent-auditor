"use client";

import { useRef, useEffect } from "react";
import type { DirectoryAgent, ChainId } from "@/lib/types";
import { AGENT_TYPE_COLORS, AGENT_TYPE_LABELS } from "@/lib/directory-seed";

interface DossierCardProps {
  readonly agent: DirectoryAgent;
  readonly index: number;
  readonly onSelect: (address: string, chainId: ChainId) => void;
}

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

function scoreColor(score: number): string {
  if (score >= 70) return "#22c55e";
  if (score >= 40) return "#eab308";
  return "#ef4444";
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

export function DossierCard({ agent, index, onSelect }: DossierCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);

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

  const circumference = Math.PI * 2 * 20;
  const filled = (agent.score / 100) * circumference;
  const typeColor = AGENT_TYPE_COLORS[agent.agentType] ?? "#525252";

  return (
    <div
      ref={cardRef}
      className="aa-dossier"
      style={{ opacity: 0 }}
      onClick={() => onSelect(agent.address, agent.chainId)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(agent.address, agent.chainId); }}
      aria-label={`Audit ${agent.name}`}
    >
      {/* Column 1: Classification Stamp */}
      <div className="aa-dossier-stamp">
        <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
          <circle cx="24" cy="24" r="20" fill="none" stroke="var(--color-border)" strokeWidth="3" />
          <circle
            cx="24" cy="24" r="20"
            fill="none"
            stroke={scoreColor(agent.score)}
            strokeWidth="3"
            strokeDasharray={`${filled} ${circumference - filled}`}
            strokeDashoffset={circumference * 0.25}
            strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.6s ease" }}
          />
          <text x="24" y="26" textAnchor="middle" fill="var(--color-text-primary)" fontSize="13" fontFamily="'JetBrains Mono', monospace" fontWeight="700">
            {agent.score}
          </text>
        </svg>
        <span className="aa-dossier-type" style={{ color: typeColor }}>
          {(AGENT_TYPE_LABELS[agent.agentType] ?? "Unknown").replace(/s$/, "").toUpperCase()}
        </span>
      </div>

      {/* Column 2: Main Content */}
      <div className="aa-dossier-content">
        <div className="aa-dossier-name">{agent.name}</div>
        <div className="aa-dossier-meta">
          <span>{agent.address.slice(0, 6)}...{agent.address.slice(-4)}</span>
          <span className="aa-dossier-chain">{agent.chainId}</span>
          <span>{agent.txCount.toLocaleString()} txns</span>
        </div>
        <p className="aa-dossier-narrative">{agent.behavioralNarrative}</p>
        {agent.anomalies.length > 0 && (
          <span className={`aa-dossier-anomaly aa-dossier-anomaly--${agent.recommendation === "BLOCKLIST" ? "danger" : "caution"}`}>
            <span aria-hidden="true">{agent.recommendation === "BLOCKLIST" ? "◆" : "▲"}</span>
            {agent.anomalies[0].length > 40 ? agent.anomalies[0].slice(0, 40) + "…" : agent.anomalies[0]}
          </span>
        )}
        {agent.funFact && <p className="aa-dossier-funfact">{agent.funFact}</p>}
      </div>

      {/* Column 3: Financial Intel */}
      <div className="aa-dossier-financials">
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

      {/* Column 4: Protocol Chips */}
      <div className="aa-dossier-protocols">
        {agent.protocolsUsed.slice(0, 4).map((p) => (
          <span key={p} className="aa-dossier-chip">{p}</span>
        ))}
        {agent.protocolsUsed.length > 4 && (
          <span className="aa-dossier-chip">+{agent.protocolsUsed.length - 4}</span>
        )}
      </div>
    </div>
  );
}
