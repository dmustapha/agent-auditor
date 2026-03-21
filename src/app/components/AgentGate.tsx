"use client";

import type { WalletClassification } from "../../lib/types";

interface AgentGateProps {
  readonly classification: WalletClassification;
  readonly onAnalyzeAnyway: () => void;
  readonly onTryExample: () => void;
}

export function AgentGate({ classification, onAnalyzeAnyway, onTryExample }: AgentGateProps) {
  return (
    <div className="aa-gate-card">
      <svg className="aa-gate-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>

      <h2 className="aa-gate-title">This Doesn&apos;t Look Like an Agent</h2>

      <p className="aa-gate-score">
        Human Likelihood: <strong>{classification.humanScore}</strong>/100
      </p>

      {classification.signals.length > 0 && (
        <ul className="aa-gate-signals">
          {classification.signals.map((signal, i) => (
            <li key={i}>{signal}</li>
          ))}
        </ul>
      )}

      <div className={`aa-gate-confidence aa-gate-confidence--${classification.confidence.toLowerCase()}`}>
        {classification.confidence} confidence
      </div>

      <div className="aa-gate-actions">
        <button className="aa-gate-analyze-btn" onClick={onAnalyzeAnyway}>
          Analyze Anyway
        </button>
        <button className="aa-gate-try-link" onClick={onTryExample}>
          Try an Agent Instead
        </button>
      </div>
    </div>
  );
}
