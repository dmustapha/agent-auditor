"use client";

import { useState } from "react";
import { SmartInput } from "./components/SmartInput";
import { ChainSelector } from "./components/ChainSelector";
import { TrustScoreCard } from "./components/TrustScoreCard";
import { TransactionTable } from "./components/TransactionTable";
import { LoadingState } from "./components/LoadingState";
import type { ChainId, InputType, AnalyzeResponse, AnalyzeErrorResponse, UITrustScore, TransactionSummary } from "@/lib/types";

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    trustScore: UITrustScore;
    transactions: TransactionSummary[];
  } | null>(null);
  const [selectedChain, setSelectedChain] = useState<ChainId | "all">("all");

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

      // Format trust score for UI
      const chainNames: Record<string, string> = {
        base: "Base", gnosis: "Gnosis", ethereum: "Ethereum",
        arbitrum: "Arbitrum", optimism: "Optimism", polygon: "Polygon",
      };

      const recommendationColors: Record<string, string> = {
        SAFE: "#22c55e", CAUTION: "#eab308", BLOCKLIST: "#ef4444",
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
        recommendationColor: recommendationColors[data.trustScore.recommendation],
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

  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-bold tracking-tight">AgentAuditor</h1>
        <p className="mt-2 text-text-secondary">
          Trust scores for AI agents across EVM chains
        </p>
      </header>

      <div className="flex gap-3 mb-8">
        <SmartInput onSubmit={handleAnalyze} disabled={loading} />
        <ChainSelector value={selectedChain} onChange={setSelectedChain} disabled={loading} />
      </div>

      {loading && <LoadingState />}

      {error && (
        <div className="rounded-lg border border-blocklist/30 bg-blocklist/10 p-4 text-blocklist">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <TrustScoreCard score={result.trustScore} />
          <TransactionTable transactions={result.transactions} chainId={result.trustScore.chainId} />
        </div>
      )}
    </main>
  );
}
