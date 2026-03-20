"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "./components/Sidebar";
import { SmartInput, detectInputType } from "./components/SmartInput";
import { ChainSelector } from "./components/ChainSelector";
import { TrustScoreCard } from "./components/TrustScoreCard";
import { TransactionTable } from "./components/TransactionTable";
import { LoadingState } from "./components/LoadingState";
import type {
  ChainId,
  InputType,
  AnalyzeResponse,
  AnalyzeErrorResponse,
  UITrustScore,
  TransactionSummary,
} from "@/lib/types";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    trustScore: UITrustScore;
    transactions: TransactionSummary[];
  } | null>(null);
  const [selectedChain, setSelectedChain] = useState<ChainId | "all">("all");
  const [inputValue, setInputValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed || loading) return;
    const { type } = detectInputType(trimmed);
    handleAnalyze(trimmed, type);
  }, [inputValue, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAnalyze(input: string, inputType: InputType) {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input, inputType, chain: selectedChain }),
      });

      if (!res.ok) {
        const errBody: AnalyzeErrorResponse = await res.json();
        setError(errBody.message);
        return;
      }

      const data: AnalyzeResponse = await res.json();

      const chainNames: Record<string, string> = {
        base: "Base",
        gnosis: "Gnosis",
        ethereum: "Ethereum",
        arbitrum: "Arbitrum",
        optimism: "Optimism",
        polygon: "Polygon",
      };

      const recommendationColors: Record<string, string> = {
        SAFE: "#22c55e",
        CAUTION: "#eab308",
        BLOCKLIST: "#ef4444",
      };

      const uiScore: UITrustScore = {
        address: data.trustScore.agentAddress,
        chainId: data.trustScore.chainId,
        chainName: chainNames[data.trustScore.chainId] ?? data.trustScore.chainId,
        score: data.trustScore.overallScore,
        maxScore: 100,
        breakdown: [
          { label: "Transaction Patterns", value: data.trustScore.breakdown.transactionPatterns, max: 25 },
          { label: "Contract Interactions", value: data.trustScore.breakdown.contractInteractions, max: 25 },
          { label: "Fund Flow", value: data.trustScore.breakdown.fundFlow, max: 25 },
          { label: "Behavioral Consistency", value: data.trustScore.breakdown.behavioralConsistency, max: 25 },
        ],
        recommendation: data.trustScore.recommendation,
        recommendationColor: recommendationColors[data.trustScore.recommendation] ?? "#8f8a82",
        flags: data.trustScore.flags,
        summary: data.trustScore.summary,
        timestamp: data.trustScore.analysisTimestamp,
      };

      setResult({
        trustScore: uiScore,
        transactions: [...data.transactions],
      });
    } catch {
      setError("Failed to connect to analysis service");
    } finally {
      setLoading(false);
    }
  }

  const hasContent = loading || error || result;

  return (
    <div className="aa-shell">
      <Sidebar activeItem="dashboard" />

      <main className="aa-main" id="main-content">
        {/* ─── HERO ─── */}
        <section className="aa-hero" aria-label="Agent Auditor — forensic trust analysis">
          <p className="aa-hero-kicker">Forensic Trust Analysis</p>
          <h1 className="aa-hero-title">
            Know every agent<br />
            <em>before you trust it.</em>
          </h1>
          <p className="aa-hero-subtitle">
            Real-time onchain trust scoring across EVM chains. Transaction patterns, fund flows, contract interactions — distilled into one authoritative score.
          </p>

          {/* Stats row */}
          <div className="aa-hero-stats" aria-label="Platform statistics">
            <div>
              <span className="aa-stat-num">84k+</span>
              <span className="aa-stat-label">Agents Scored</span>
            </div>
            <div>
              <span className="aa-stat-num">7</span>
              <span className="aa-stat-label">EVM Chains</span>
            </div>
            <div>
              <span className="aa-stat-num">4.1B</span>
              <span className="aa-stat-label">Txns Analyzed</span>
            </div>
          </div>

          {/* Full-width input form */}
          <div className="aa-form-container" role="search" aria-label="Agent lookup form">
            <label className="aa-form-label" htmlFor="agent-input">
              Agent Identifier
            </label>
            <div className="aa-form-row">
              <SmartInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleSubmit}
                disabled={loading}
              />
              <ChainSelector
                value={selectedChain}
                onChange={setSelectedChain}
                disabled={loading}
              />
              <button
                onClick={handleSubmit}
                disabled={loading || !inputValue.trim()}
                className="aa-audit-btn"
                aria-label="Run forensic audit"
              >
                <span>Run Audit</span>
                <svg
                  className="aa-btn-arrow"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* ─── CONTENT AREA ─── */}
        <div className="aa-content">
          {/* Loading */}
          {loading && <LoadingState />}

          {/* Error */}
          {!loading && error && (
            <div className="aa-error-card" role="alert" aria-live="assertive">
              <svg
                className="aa-error-icon"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <div>
                <p className="aa-error-title">Analysis Failed</p>
                <p className="aa-error-msg">{error}</p>
              </div>
            </div>
          )}

          {/* Results */}
          {!loading && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <TrustScoreCard score={result.trustScore} />
              <TransactionTable
                transactions={result.transactions}
                chainId={result.trustScore.chainId}
              />
            </div>
          )}

          {/* Empty state */}
          {!hasContent && (
            <div className="aa-empty-state" aria-label="No agent selected">
              <svg
                className="aa-empty-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="M12 8v4M12 16h.01" />
              </svg>
              <p className="aa-empty-title">No agent selected</p>
              <p className="aa-empty-body">
                Enter an Agent ID, wallet address, or ENS name above to begin a forensic audit.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
