"use client";

import { useState, useCallback, useRef, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Sidebar } from "../components/Sidebar";
import { SmartInput, detectInputType } from "../components/SmartInput";
import { ChainSelector } from "../components/ChainSelector";
import { TrustScoreCard } from "../components/TrustScoreCard";
import { TransactionTable } from "../components/TransactionTable";
import { LoadingState, type LoadingStep } from "../components/LoadingState";
import { AgentDirectory } from "../components/AgentDirectory";
import { AgentGate } from "../components/AgentGate";
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
  WalletClassification,
} from "@/lib/types";

function deriveBadge(
  wc: WalletClassification | null,
  hasIdentity: boolean,
): "verified" | "detected" | "unclassified" | null {
  if (hasIdentity) return "verified";
  if (wc && wc.humanScore < 30) return "detected";
  if (wc && wc.humanScore >= 30 && wc.humanScore <= 70) return "unclassified";
  return null;
}

const VALID_CHAINS = new Set(["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon", "all"]);


const LOADING_STEPS = [
  "Initializing trust engine...",
  "Connecting to EVM networks...",
  "Loading agent registry...",
  "Calibrating AI models...",
  "Dashboard ready.",
] as const;

const STEP_INTERVAL = 380;
const LOADING_DURATION = LOADING_STEPS.length * STEP_INTERVAL + 300;

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

function TransitionLoadingScreen({ onComplete }: { onComplete: () => void }) {
  const [activeStep, setActiveStep] = useState(0);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    LOADING_STEPS.forEach((_, i) => {
      timersRef.current.push(
        setTimeout(() => setActiveStep(i), i * STEP_INTERVAL),
      );
    });

    timersRef.current.push(
      setTimeout(onComplete, LOADING_DURATION),
    );

    return () => timersRef.current.forEach(clearTimeout);
  }, [onComplete]);

  const progressPercent = Math.min(
    ((activeStep + 1) / LOADING_STEPS.length) * 100,
    100,
  );

  return (
    <motion.div
      className="aa-loading-screen"
      initial={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="aa-loading-brand">AgentAuditor</div>
      <div className="aa-loading-steps">
        {LOADING_STEPS.map((text, i) => {
          const state =
            i < activeStep ? "done" : i === activeStep ? "active" : "";
          return (
            <div
              key={i}
              className={`aa-loading-screen-step ${state}`}
            >
              {text}
            </div>
          );
        })}
      </div>
      <div className="aa-loading-bar-wrap">
        <div
          className="aa-loading-bar-fill"
          style={{ width: `${progressPercent}%`, transition: "width 0.4s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </div>
    </motion.div>
  );
}

const sidebarContainerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.15 },
  },
};

function Dashboard() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Show loading transition only on first visit (no address param = fresh entry)
  const hasAddressParam = searchParams.get("address") != null;
  const [ready, setReady] = useState(hasAddressParam);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; suggestion?: string } | null>(null);
  const [result, setResult] = useState<{
    trustScore: UITrustScore;
    transactions: TransactionSummary[];
    totalTransactionCount?: number;
  } | null>(null);
  const [selectedChain, setSelectedChain] = useState<ChainId | "all">("all");
  const [inputValue, setInputValue] = useState("");
  const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([]);
  const [activeFilter, setActiveFilter] = useState<AgentType | null>(null);
  const [sortField, setSortField] = useState<SortField>("score");
  const [forceAnalysis, setForceAnalysis] = useState(false);
  const [walletClassification, setWalletClassification] = useState<WalletClassification | null>(null);
  const [hasAgentIdentity, setHasAgentIdentity] = useState(false);
  const [attestationTxHash, setAttestationTxHash] = useState<string | null>(null);
  const [chainResults, setChainResults] = useState<readonly { chainId: string; txCount: number }[]>([]);
  const { records: recentAudits, addAudit } = useRecentAudits();
  const { agents: directoryAgents, allAgents, loading: directoryLoading, error: directoryError, lastSynced } = useDirectory(activeFilter, sortField, recentAudits);
  const agentCount = useMemo(() => {
    const addresses = new Set([
      ...allAgents.map(a => a.address.toLowerCase()),
      ...recentAudits.map(r => r.address.toLowerCase()),
    ]);
    return addresses.size || 1;
  }, [allAgents, recentAudits]);

  const inputRef = useRef<HTMLInputElement>(null);
  const stepTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastSearchRef = useRef<{ input: string; chain: ChainId | "all" } | null>(null);
  const initializedRef = useRef(false);

  const runAudit = useCallback(async (input: string, chain: ChainId | "all") => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    const { type: inputType } = detectInputType(trimmed);

    lastSearchRef.current = { input, chain };

    setLoading(true);
    setError(null);
    setResult(null);
    setForceAnalysis(false);
    setWalletClassification(null);
    setHasAgentIdentity(false);
    setAttestationTxHash(null);
    setChainResults([]);

    stepTimersRef.current.forEach(clearTimeout);
    stepTimersRef.current = [];

    setLoadingSteps([
      { label: "Resolving address...", status: "active" },
      { label: "Scanning network...", status: "pending" },
      { label: "Fetching on-chain data...", status: "pending" },
      { label: "Running AI analysis...", status: "pending" },
      { label: "Building intelligence report...", status: "pending" },
    ]);

    stepTimersRef.current.push(
      setTimeout(() => {
        setLoadingSteps((prev) => prev.map((s, i) =>
          i === 0 ? { ...s, status: "complete" as const, detail: "Address resolved" }
          : i === 1 ? { ...s, status: "active" as const }
          : s
        ));
      }, 800),
      setTimeout(() => {
        setLoadingSteps((prev) => prev.map((s, i) =>
          i === 1 ? { ...s, status: "complete" as const, detail: "Transactions found" }
          : i === 2 ? { ...s, status: "active" as const }
          : s
        ));
      }, 2000),
      setTimeout(() => {
        setLoadingSteps((prev) => prev.map((s, i) =>
          i === 2 ? { ...s, status: "complete" as const, detail: "Data assembled" }
          : i === 3 ? { ...s, status: "active" as const }
          : s
        ));
      }, 3000),
    );

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: trimmed, inputType, chain }),
      });

      if (!res.ok) {
        const errBody: AnalyzeErrorResponse = await res.json();
        setError({ message: errBody.message, suggestion: errBody.suggestion });
        return;
      }

      const data: AnalyzeResponse = await res.json();
      setWalletClassification(data.walletClassification ?? null);
      setHasAgentIdentity(data.agentIdentity != null);
      setAttestationTxHash(data.attestationTxHash ?? null);
      setChainResults(data.chainResults ?? []);
      const uiScore = formatForUI(data.trustScore, {
        successRate: data.successRate,
        ethPrice: data.ethPrice,
        behavioralProfile: data.behavioralProfile,
        ensName: data.ensName ?? null,
      });

      setLoadingSteps((prev) => prev.map((s, i) =>
        i <= 2 ? { ...s, status: "complete" as const }
        : i === 3 ? { ...s, status: "complete" as const, detail: "Analysis complete" }
        : i === 4 ? { ...s, status: "active" as const }
        : s
      ));

      await new Promise((r) => setTimeout(r, 500));
      setLoadingSteps((prev) => prev.map((s) => ({ ...s, status: "complete" as const })));

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

      // Update URL permalink — stay on /dashboard
      router.replace(`/dashboard?address=${encodeURIComponent(uiScore.address)}&chain=${uiScore.chainId}`, { scroll: false });
    } catch {
      setError({ message: "Failed to connect to analysis service" });
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
    router.replace("/dashboard", { scroll: false });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [router]);

  const handleLoadingComplete = useCallback(() => {
    setReady(true);
    setTimeout(() => inputRef.current?.focus(), 400);
  }, []);

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

  const shouldGate =
    walletClassification &&
    walletClassification.humanScore > 70 &&
    walletClassification.confidence !== "LOW" &&
    !forceAnalysis;

  const showHero = !result && !loading && !error;
  const hasContent = loading || error || result;

  // Show transition screen on fresh entry (no address param)
  if (!ready) {
    return <TransitionLoadingScreen onComplete={handleLoadingComplete} />;
  }

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
      {!showHero && (
        <button className="aa-new-search-btn" onClick={handleNewSearch} aria-label="Start new search">
          New Search
        </button>
      )}
    </div>
  );

  return (
    <motion.div
      className="aa-shell"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        variants={sidebarContainerVariants}
        initial="hidden"
        animate="visible"
      >
        <Sidebar
          activeItem="dashboard"
          recentAudits={recentAudits}
          onSelectAudit={handleSelectAudit}
          directoryAgents={allAgents}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
        />
      </motion.div>

      <main className="aa-main" id="main-content">
        <section
          className={`aa-hero${showHero ? '' : ' aa-hero--collapsed'}`}
          aria-label="Agent Auditor: forensic trust analysis"
        >
          <p className="aa-hero-kicker">Forensic Trust Analysis</p>
          <h1 className="aa-hero-title">
            Know every agent<br />
            <em>before you trust it.</em>
          </h1>
          <p className="aa-hero-subtitle">
            Real-time onchain trust scoring across EVM chains. Transaction patterns, fund flows, and contract interactions distilled into one authoritative score.
          </p>

          <div className="aa-hero-stats" aria-label="Platform statistics">
            <div>
              <HeroStatCounter key={agentCount} end={agentCount} />
              <span className="aa-stat-label">Agents Indexed</span>
            </div>
            <div>
              <HeroStatCounter end={7} />
              <span className="aa-stat-label">EVM Chains</span>
            </div>
            <div>
              <span className="aa-stat-num">Live</span>
              <span className="aa-stat-label">Analysis</span>
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
          </div>
        </section>

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
                <p className="aa-error-msg">{error.message}</p>
                {error.suggestion && (
                  <p className="aa-error-suggestion">{error.suggestion}</p>
                )}
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

          {!loading && shouldGate && walletClassification && (
            <AgentGate
              classification={walletClassification}
              onAnalyzeAnyway={() => setForceAnalysis(true)}
              onTryExample={() => {
                setForceAnalysis(false);
                setResult(null);
                setWalletClassification(null);
                setHasAgentIdentity(false);
                window.scrollTo({ top: 0, behavior: "smooth" });
                setTimeout(() => inputRef.current?.focus(), 100);
              }}
            />
          )}

          {!loading && result && !shouldGate && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
              <TrustScoreCard score={result.trustScore} badge={deriveBadge(walletClassification, hasAgentIdentity)} attestationTxHash={attestationTxHash} chainResults={chainResults} />
              <div className="aa-reveal aa-delay-5 visible">
                <TransactionTable
                  transactions={result.transactions}
                  chainId={result.trustScore.chainId}
                  totalCount={result.totalTransactionCount}
                  agentAddress={result.trustScore.address}
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
    </motion.div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}
