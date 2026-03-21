"use client";

import { useState, useCallback, useRef, useEffect, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Sidebar } from "./components/Sidebar";
import { SmartInput, detectInputType } from "./components/SmartInput";
import { ChainSelector } from "./components/ChainSelector";
import { TrustScoreCard } from "./components/TrustScoreCard";
import { TransactionTable } from "./components/TransactionTable";
import { LoadingState } from "./components/LoadingState";
import { AgentDirectory } from "./components/AgentDirectory";
import { useRecentAudits } from "@/hooks/useRecentAudits";
import { useDirectory } from "@/hooks/useDirectory";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { formatForUI } from "@/lib/trust-score";
import type {
  ChainId,
  AgentType,
  SortField,
  AnalyzeResponse,
  AnalyzeErrorResponse,
  UITrustScore,
  TransactionSummary,
} from "@/lib/types";

const VALID_CHAINS = new Set(["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon", "all"]);

const EXAMPLE_AGENTS = [
  { label: "Uniswap V3 Router", address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", chain: "ethereum" as ChainId },
  { label: "Chainlink ETH/USD", address: "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419", chain: "ethereum" as ChainId },
  { label: "jaredfromsubway.eth", address: "0x6b75d8AF000000e20B7a7DDf000Ba900b4009A80", chain: "ethereum" as ChainId },
];

function HeroStatCounter({ end, suffix = "", format }: { end: number; suffix?: string; format?: (v: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const counted = useRef(false);

  useEffect(() => {
    if (counted.current || !ref.current) return;
    counted.current = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      ref.current.textContent = format ? format(end) : `${end}${suffix}`;
      return;
    }
    const el = ref.current;
    const duration = 1200;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(eased * end);
      el.textContent = format ? format(value) : `${value}${suffix}`;
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [end, suffix, format]);

  return <span ref={ref} className="aa-stat-num">0</span>;
}

function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    trustScore: UITrustScore;
    transactions: TransactionSummary[];
    totalTransactionCount?: number;
  } | null>(null);
  const [selectedChain, setSelectedChain] = useState<ChainId | "all">("all");
  const [inputValue, setInputValue] = useState("");
  const [loadingSteps, setLoadingSteps] = useState<Array<{ label: string; status: "pending" | "active" | "complete" }>>([]);
  const [activeFilter, setActiveFilter] = useState<AgentType | null>(null);
  const [sortField, setSortField] = useState<SortField>("score");
  const { records: recentAudits, addAudit } = useRecentAudits();
  const { agents: directoryAgents, allAgents, loading: directoryLoading, error: directoryError, lastSynced } = useDirectory(activeFilter, sortField);
  const inputRef = useRef<HTMLInputElement>(null);
  const stepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastSearchRef = useRef<{ input: string; chain: ChainId | "all" } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initializedRef = useRef(false);

  const runAudit = useCallback(async (input: string, chain: ChainId | "all") => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    const { type: inputType } = detectInputType(trimmed);

    lastSearchRef.current = { input, chain };

    setLoading(true);
    setError(null);
    setResult(null);

    // Clear any prior timers
    stepTimersRef.current.forEach(clearTimeout);
    stepTimersRef.current = [];

    const firstLabel = chain === "all" ? "Detecting chain..." : "Resolving address...";
    setLoadingSteps([
      { label: firstLabel, status: "active" },
      { label: `Fetching transactions${chain !== "all" ? ` (${chain})` : ""}...`, status: "pending" },
      { label: "Analyzing with AI...", status: "pending" },
    ]);

    stepTimersRef.current.push(
      setTimeout(() => setLoadingSteps(prev => prev.map((s, i) =>
        i === 0 ? { ...s, status: "complete" } : i === 1 ? { ...s, status: "active" } : s
      )), 800),
      setTimeout(() => setLoadingSteps(prev => prev.map((s, i) =>
        i <= 1 ? { ...s, status: "complete" } : i === 2 ? { ...s, status: "active" } : s
      )), 2500),
    );

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: trimmed, inputType, chain }),
      });

      if (!res.ok) {
        const errBody: AnalyzeErrorResponse = await res.json();
        setError(errBody.message);
        return;
      }

      const data: AnalyzeResponse = await res.json();
      const uiScore = formatForUI(data.trustScore);

      setLoadingSteps(prev => prev.map((s, i) =>
        i === 0 ? { ...s, label: `Detected: ${uiScore.chainId}`, status: "complete" as const } : s
      ));

      setResult({
        trustScore: uiScore,
        transactions: [...data.transactions],
        totalTransactionCount: data.totalTransactionCount,
      });

      addAudit({
        address: uiScore.address,
        chainId: uiScore.chainId,
        score: uiScore.score,
        recommendation: data.trustScore.recommendation,
        timestamp: Date.now(),
        agentType: data.trustScore.agentType,
      });

      // Update URL permalink
      router.replace(`?address=${encodeURIComponent(uiScore.address)}&chain=${uiScore.chainId}`, { scroll: false });
    } catch {
      setError("Failed to connect to analysis service");
    } finally {
      stepTimersRef.current.forEach(clearTimeout);
      stepTimersRef.current = [];
      setLoading(false);
    }
  }, [loading, addAudit, router]);

  const handleSubmit = useCallback(() => {
    runAudit(inputValue, selectedChain);
  }, [inputValue, selectedChain, runAudit]);

  const handleSelectAudit = useCallback((address: string, chainId: ChainId) => {
    setInputValue(address);
    setSelectedChain(chainId);
    runAudit(address, chainId);
  }, [runAudit]);

  const handleNewSearch = useCallback(() => {
    setResult(null);
    setError(null);
    setInputValue("");
    router.replace("/", { scroll: false });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [router]);

  // URL params: auto-populate and run on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const address = searchParams.get("address");
    const chain = searchParams.get("chain");

    if (address) {
      setInputValue(address);
      const validChain = chain && VALID_CHAINS.has(chain) ? (chain as ChainId | "all") : "all";
      setSelectedChain(validChain);
      // Defer to avoid running during render
      setTimeout(() => runAudit(address, validChain), 0);
    }
  }, [searchParams, runAudit]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onFocusSearch: useCallback(() => inputRef.current?.focus(), []),
    onClear: useCallback(() => {
      if (document.activeElement === inputRef.current) {
        setInputValue("");
      }
    }, []),
  });

  const showHero = !result && !loading && !error;
  const hasContent = loading || error || result;

  const searchForm = (
    <div className="aa-form-row">
      <SmartInput
        value={inputValue}
        onChange={setInputValue}
        onSubmit={handleSubmit}
        disabled={loading}
        inputRef={inputRef}
      />
      <ChainSelector
        value={selectedChain}
        onChange={setSelectedChain}
        disabled={loading}
      />
      <button
        onClick={handleSubmit}
        disabled={loading || !inputValue.trim()}
        className={`aa-audit-btn${loading ? ' aa-audit-btn--loading' : ''}`}
        aria-label={loading ? "Analyzing agent" : "Run forensic audit"}
      >
        <span>{loading ? 'Analyzing...' : 'Run Audit'}</span>
        {loading ? (
          <span className="aa-btn-spinner" aria-hidden="true" />
        ) : (
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
        )}
      </button>
    </div>
  );

  return (
    <div className="aa-shell">
      <Sidebar
        activeItem="dashboard"
        recentAudits={recentAudits}
        onSelectAudit={handleSelectAudit}
        directoryAgents={allAgents}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      <main className="aa-main" id="main-content">
        {/* ─── HERO (always rendered, collapses via CSS class) ─── */}
        <section
          className={`aa-hero${showHero ? '' : ' aa-hero--collapsed'}`}
          aria-label="Agent Auditor — forensic trust analysis"
        >
          <p className="aa-hero-kicker">Forensic Trust Analysis</p>
          <h1 className="aa-hero-title">
            Know every agent<br />
            <em>before you trust it.</em>
          </h1>
          <p className="aa-hero-subtitle">
            Real-time onchain trust scoring across EVM chains. Transaction patterns, fund flows, contract interactions — distilled into one authoritative score.
          </p>

          <div className="aa-hero-stats" aria-label="Platform statistics">
            <div>
              <HeroStatCounter end={84000} format={(v) => v >= 1000 ? `${Math.round(v / 1000)}k+` : `${v}`} />
              <span className="aa-stat-label">Agents Scored</span>
            </div>
            <div>
              <HeroStatCounter end={7} />
              <span className="aa-stat-label">EVM Chains</span>
            </div>
            <div>
              <HeroStatCounter end={41} format={(v) => `${(v / 10).toFixed(1)}B`} />
              <span className="aa-stat-label">Txns Analyzed</span>
            </div>
          </div>

          <div className="aa-form-container" role="search" aria-label="Agent lookup form">
            {showHero && (
              <label className="aa-form-label" htmlFor="agent-input">Agent Identifier</label>
            )}
            {searchForm}
            {showHero && (
              <p className="aa-kbd-hint">
                <kbd className="aa-kbd">⌘K</kbd> to focus · <kbd className="aa-kbd">Esc</kbd> to clear
              </p>
            )}
            {!showHero && (
              <span className="aa-kbd-hint-compact">
                <kbd className="aa-kbd">⌘K</kbd>
              </span>
            )}
            {showHero && (
              <div className="aa-example-agents" aria-label="Example agents to try">
                <span className="aa-example-label">Try an example:</span>
                {EXAMPLE_AGENTS.map((ex) => (
                  <button
                    key={ex.address}
                    className="aa-example-btn"
                    onClick={() => {
                      setInputValue(ex.address);
                      setSelectedChain(ex.chain);
                      runAudit(ex.address, ex.chain);
                    }}
                  >
                    {ex.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!showHero && (
            <button className="aa-new-search-btn" onClick={handleNewSearch} aria-label="Start new search">
              New Search
            </button>
          )}
        </section>

        {/* ─── CONTENT AREA ─── */}
        <div className="aa-content">
          {loading && <LoadingState steps={loadingSteps} />}

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
                <button
                  className="aa-retry-btn"
                  onClick={() => lastSearchRef.current && runAudit(lastSearchRef.current.input, lastSearchRef.current.chain)}
                  aria-label="Retry analysis"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {!loading && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <TrustScoreCard score={result.trustScore} />
              <div className="aa-reveal aa-delay-5 visible">
                <TransactionTable
                  transactions={result.transactions}
                  chainId={result.trustScore.chainId}
                  totalCount={result.totalTransactionCount}
                />
              </div>
            </div>
          )}

          {!hasContent && (
            <AgentDirectory
              agents={directoryAgents}
              sortField={sortField}
              onSortChange={setSortField}
              onSelectAgent={handleSelectAudit}
              lastSynced={lastSynced}
              loading={directoryLoading}
              error={directoryError}
            />
          )}
        </div>
      </main>
    </div>
  );
}

// Wrap in Suspense for useSearchParams
export default function Page() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}
