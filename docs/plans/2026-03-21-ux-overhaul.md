# Agent Auditor UX Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Agent Auditor from a generic wallet analyzer into an agent-specific intelligence tool with strengthened classification, a human-wallet gate, rich activity profiling, contextual financials, animated loading, and human-readable transaction labels.

**Architecture:** 10 tasks, backend-first (classifier + Venice prompt + price API), then frontend (gate UI, loading, identity header, activity profile, financial context, tx table, ETH price display). Each task is independently testable. The classifier strengthening (Task 1) must land first as Tasks 2, 5, and 7 depend on its output. Task 4 (Venice prompt) must land before Task 7 (activity profile UI). Task 10 (ETH price) touches the API route and UI.

**Tech Stack:** Next.js 16, React 19, TypeScript strict, Tailwind v4, Bun, Venice AI (llama-3.3-70b), Blockscout REST API, CoinGecko API (free tier)

**Project root:** `~/hackathon-toolkit/active/agent-auditor/`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/agent-classifier.ts` | Modify | Add 7 new heuristics, confidence field |
| `src/lib/types.ts` | Modify | Add `confidence` to `WalletClassification`, `ActivityProfile` type, `ethPrice` to `UITrustScore` |
| `src/lib/venice.ts` | Modify | Update SYSTEM_PROMPT for activityProfile, enhance narrative instructions |
| `src/lib/trust-score.ts` | Modify | Pass through activityProfile + ethPrice in formatForUI |
| `src/lib/price.ts` | Create | ETH price fetcher with 5-min cache |
| `src/lib/method-labels.ts` | Create | Method selector → human-readable verb + protocol |
| `src/app/api/analyze/route.ts` | Modify | Call getETHPrice, pass to response |
| `src/app/page.tsx` | Modify | Gate logic, forceAnalysis state, 5-step loading |
| `src/app/components/AgentGate.tsx` | Create | Human wallet rejection card |
| `src/app/components/LoadingState.tsx` | Modify | 5-step animated loader with skeleton |
| `src/app/components/TrustScoreCard.tsx` | Modify | Identity header, breakdown explanations, financial context, USD values, badge system |
| `src/app/components/ActivityProfile.tsx` | Create | Rich activity profile replacing behavioral narrative |
| `src/app/components/TransactionTable.tsx` | Modify | Action column, success indicator |
| `src/app/globals.css` | Modify | New animations (pulse ring, skeleton, gate card) |

---

## Task 1: Classifier Strengthening

**Files:**
- Modify: `src/lib/types.ts` (add `confidence` to `WalletClassification`)
- Modify: `src/lib/agent-classifier.ts` (add 7 heuristics + confidence)
- Create: `src/__tests__/agent-classifier.test.ts`

**Why first:** Tasks 2 and 5 depend on the `confidence` field. This is pure backend logic with no UI dependencies.

- [ ] **Step 1: Add confidence to WalletClassification type**

In `src/lib/types.ts`, find the `WalletClassification` interface and add:

```typescript
readonly confidence: "LOW" | "MEDIUM" | "HIGH";
```

- [ ] **Step 2: Write failing tests for each new heuristic**

Create `src/__tests__/agent-classifier.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { computeWalletClassification } from "../lib/agent-classifier";
import type { TransactionSummary, AddressInfo } from "../lib/types";

// Helper: create minimal tx array (only TransactionSummary fields)
function makeTxs(overrides: Partial<TransactionSummary>[], count?: number): readonly TransactionSummary[] {
  const base: TransactionSummary = {
    hash: "0xabc",
    from: "0xSELF",
    to: "0xTARGET1",
    value: "0",
    gasUsed: "21000",
    gasLimit: "21000",
    methodId: "0xa9059cbb",
    timestamp: 1700000000,
    success: true,
    nonce: 0,
  };
  const txs = (overrides.length > 0 ? overrides : Array(count ?? 1).fill({}))
    .map((o, i) => ({ ...base, nonce: i, timestamp: base.timestamp + i * 3600, hash: `0x${i}`, ...o }));
  return txs as readonly TransactionSummary[];
}

describe("Counterparty concentration (Herfindahl)", () => {
  test("highly concentrated (1 counterparty) lowers humanScore", () => {
    const txs = makeTxs(Array(20).fill({ to: "0xSAME" }));
    const result = computeWalletClassification(txs);
    expect(result.humanScore).toBeLessThan(50); // bot signal
    expect(result.signals.some((s: string) => s.toLowerCase().includes("counterparty"))).toBe(true);
  });

  test("diverse counterparties raises humanScore", () => {
    const txs = makeTxs(Array(20).fill(null).map((_, i) => ({ to: `0xADDR${i}` })));
    const result = computeWalletClassification(txs);
    expect(result.humanScore).toBeGreaterThanOrEqual(50);
  });
});

describe("Contract vs EOA call ratio", () => {
  test("all contract calls (methodId present) lowers humanScore", () => {
    const txs = makeTxs(Array(20).fill({ methodId: "0xa9059cbb", value: "0" }));
    const result = computeWalletClassification(txs);
    expect(result.signals.some((s: string) => s.toLowerCase().includes("contract"))).toBe(true);
  });

  test("mostly plain ETH transfers raises humanScore", () => {
    const txs = makeTxs(Array(20).fill({ methodId: "0x", value: "1000000000000000000" }));
    const result = computeWalletClassification(txs);
    expect(result.humanScore).toBeGreaterThanOrEqual(50);
  });
});

describe("Gas limit consistency", () => {
  test("identical gas limits lowers humanScore", () => {
    const txs = makeTxs(Array(20).fill({ gasLimit: "100000" }));
    const result = computeWalletClassification(txs);
    expect(result.signals.some((s: string) => s.toLowerCase().includes("gas"))).toBe(true);
  });
});

describe("Value entropy", () => {
  test("identical values (zero entropy) lowers humanScore", () => {
    const txs = makeTxs(Array(20).fill({ value: "1000000000000000000" }));
    const result = computeWalletClassification(txs);
    expect(result.signals.some((s: string) => s.toLowerCase().includes("value") || s.toLowerCase().includes("entropy"))).toBe(true);
  });
});

describe("Nonce gap rate", () => {
  test("zero nonce gaps with 50+ txs lowers humanScore", () => {
    const txs = makeTxs(Array(60).fill(null).map((_, i) => ({ nonce: i })));
    const result = computeWalletClassification(txs);
    expect(result.signals.some((s: string) => s.toLowerCase().includes("nonce"))).toBe(true);
  });
});

describe("Burst detection", () => {
  test("regular bursts lowers humanScore", () => {
    // 5 bursts of 4 txs, each burst 3600s apart, txs within burst 10s apart
    const txs = makeTxs(
      Array(20).fill(null).map((_, i) => ({
        timestamp: 1700000000 + Math.floor(i / 4) * 3600 + (i % 4) * 10,
      }))
    );
    const result = computeWalletClassification(txs);
    expect(result.signals.some((s: string) => s.toLowerCase().includes("burst"))).toBe(true);
  });
});

describe("Confidence", () => {
  test("< 10 txs → LOW confidence", () => {
    const txs = makeTxs(Array(5).fill({}));
    const result = computeWalletClassification(txs);
    expect(result.confidence).toBe("LOW");
  });

  test("10-50 txs → MEDIUM confidence", () => {
    const txs = makeTxs(Array(25).fill(null).map((_, i) => ({ nonce: i })));
    const result = computeWalletClassification(txs);
    expect(result.confidence).toBe("MEDIUM");
  });

  test("> 50 txs → HIGH confidence", () => {
    const txs = makeTxs(Array(60).fill(null).map((_, i) => ({ nonce: i })));
    const result = computeWalletClassification(txs);
    expect(result.confidence).toBe("HIGH");
  });
});
```

- [ ] **Step 3: Run tests — verify they fail**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && bun test src/__tests__/agent-classifier.test.ts
```

Expected: Multiple failures (missing `confidence` field, missing signals for new heuristics).

- [ ] **Step 4: Implement the 7 new heuristics in agent-classifier.ts**

Add these private functions after the existing heuristic functions. Each follows the immutable `(txs, score, signals) => score` pattern:

```typescript
function applyCounterpartyConcentration(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  if (txs.length < 5) return score;
  const counts: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.to) {
      counts[tx.to.toLowerCase()] = (counts[tx.to.toLowerCase()] || 0) + 1;
    }
  }
  const total = txs.length;
  const hhi = Object.values(counts).reduce((sum, c) => sum + (c / total) ** 2, 0);
  if (hhi > 0.5) {
    signals.push("Counterparty concentration very high (HHI > 0.5) — bot signal");
    return score - 15;
  }
  if (hhi < 0.1) {
    signals.push("Diverse counterparties (HHI < 0.1) — human signal");
    return score + 10;
  }
  return score;
}

function applyContractVsEOARatio(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  if (txs.length < 5) return score;
  const contractCalls = txs.filter(
    (tx) => tx.methodId && tx.methodId !== "0x" && tx.methodId !== "0x00000000",
  ).length;
  const ratio = contractCalls / txs.length;
  if (ratio > 0.9) {
    signals.push(`Contract call ratio ${(ratio * 100).toFixed(0)}% — bot signal`);
    return score - 15;
  }
  if (ratio < 0.5) {
    signals.push(`Low contract call ratio ${(ratio * 100).toFixed(0)}% — human signal`);
    return score + 10;
  }
  return score;
}

function applyGasLimitConsistency(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  if (txs.length < 10) return score;
  const limits = txs.map((tx) => Number(tx.gasLimit));
  const mean = limits.reduce((a, b) => a + b, 0) / limits.length;
  if (mean === 0) return score;
  const variance = limits.reduce((sum, v) => sum + (v - mean) ** 2, 0) / limits.length;
  const cv = Math.sqrt(variance) / mean;
  if (cv < 0.1) {
    signals.push(`Gas limit CV ${cv.toFixed(3)} — nearly identical, bot signal`);
    return score - 10;
  }
  if (cv > 0.5) {
    signals.push(`Gas limit CV ${cv.toFixed(3)} — varied, human signal`);
    return score + 5;
  }
  return score;
}

function applyValueEntropy(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  if (txs.length < 10) return score;
  // Bucket values into ranges: 0, <0.001, <0.01, <0.1, <1, <10, >=10 ETH
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  for (const tx of txs) {
    const val = Number(BigInt(tx.value || "0")) / 1e18;
    if (val === 0) buckets[0]++;
    else if (val < 0.001) buckets[1]++;
    else if (val < 0.01) buckets[2]++;
    else if (val < 0.1) buckets[3]++;
    else if (val < 1) buckets[4]++;
    else if (val < 10) buckets[5]++;
    else buckets[6]++;
  }
  const total = txs.length;
  let entropy = 0;
  for (const count of buckets) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }
  if (entropy < 1.0) {
    signals.push(`Low value entropy (${entropy.toFixed(2)}) — repetitive values, bot signal`);
    return score - 10;
  }
  if (entropy > 2.5) {
    signals.push(`High value entropy (${entropy.toFixed(2)}) — diverse values, human signal`);
    return score + 5;
  }
  return score;
}

function applyNonceGapRate(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  const withNonce = txs.filter((tx): tx is TransactionSummary & { nonce: number } => tx.nonce != null);
  if (withNonce.length < 10) return score;
  const sorted = [...withNonce].sort((a, b) => a.nonce - b.nonce);
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].nonce - sorted[i - 1].nonce > 1) gaps++;
  }
  const rate = gaps / withNonce.length;
  if (rate === 0 && withNonce.length >= 50) {
    signals.push("Zero nonce gaps across 50+ txs — bot signal");
    return score - 5;
  }
  if (rate > 0.05) {
    signals.push(`Nonce gap rate ${(rate * 100).toFixed(1)}% — human signal`);
    return score + 5;
  }
  return score;
}

function applyBurstDetection(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  if (txs.length < 10) return score;
  const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);

  // Group into bursts (gap < 60s between consecutive txs)
  const bursts: number[][] = [];
  let currentBurst = [sorted[0].timestamp];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].timestamp - sorted[i - 1].timestamp < 60) {
      currentBurst.push(sorted[i].timestamp);
    } else {
      if (currentBurst.length >= 2) bursts.push(currentBurst);
      currentBurst = [sorted[i].timestamp];
    }
  }
  if (currentBurst.length >= 2) bursts.push(currentBurst);

  if (bursts.length < 3) return score;

  // Check regularity of burst-to-burst gaps
  const burstStarts = bursts.map((b) => b[0]);
  const gaps: number[] = [];
  for (let i = 1; i < burstStarts.length; i++) {
    gaps.push(burstStarts[i] - burstStarts[i - 1]);
  }
  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (meanGap === 0) return score;
  const gapVariance = gaps.reduce((sum, g) => sum + (g - meanGap) ** 2, 0) / gaps.length;
  const gapCV = Math.sqrt(gapVariance) / meanGap;

  if (gapCV < 0.3) {
    signals.push(`Regular burst pattern (CV ${gapCV.toFixed(2)}) — bot signal`);
    return score - 10;
  }
  return score;
}

function computeConfidence(txCount: number): "LOW" | "MEDIUM" | "HIGH" {
  if (txCount < 10) return "LOW";
  if (txCount <= 50) return "MEDIUM";
  return "HIGH";
}
```

Update `computeWalletClassification` to call all 12 heuristics and set confidence:

In the EOA branch (after existing heuristics), add calls to all 7 new functions in sequence, passing and reassigning `score` and `signals`. After all heuristics:

```typescript
const confidence = computeConfidence(txs.length);
// ... clamp score ...
return { humanScore: clampedScore, signals, confidence };
```

For the contract branch (Tier 1 early return), also include `confidence`:

```typescript
return { humanScore: 0, signals: ["Contract address — classified as agent"], confidence: computeConfidence(txs.length) };
```

- [ ] **Step 5: Run tests — verify they pass**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && bun test src/__tests__/agent-classifier.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Run typecheck**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

Fix any type errors (likely: existing code that creates `WalletClassification` objects without `confidence`).

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent-classifier.ts src/lib/types.ts src/__tests__/agent-classifier.test.ts
git commit -m "feat: strengthen classifier with 7 new heuristics + confidence scoring"
```

---

## Task 2: Agent Gate UI

**Files:**
- Create: `src/app/components/AgentGate.tsx`
- Modify: `src/app/page.tsx` (gate logic + forceAnalysis state)
- Modify: `src/app/components/TrustScoreCard.tsx` (badge prop)
- Modify: `src/app/globals.css` (gate card styles)

**Depends on:** Task 1 (needs `confidence` field on `WalletClassification`)

- [ ] **Step 1: Add gate styles to globals.css**

Append to `src/app/globals.css`:

```css
/* Agent Gate */
.aa-gate-card {
  max-width: 32rem;
  margin: 2rem auto;
  padding: 2.5rem;
  background: var(--color-surface-alt);
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  text-align: center;
}

.aa-gate-icon {
  width: 4rem;
  height: 4rem;
  margin: 0 auto 1.5rem;
  color: var(--color-caution);
  opacity: 0.8;
}

.aa-gate-title {
  font-family: var(--font-display);
  font-size: 1.5rem;
  color: var(--color-text);
  margin-bottom: 0.75rem;
}

.aa-gate-score {
  font-family: var(--font-mono);
  font-size: 1.1rem;
  color: var(--color-text-muted);
  margin-bottom: 1.25rem;
}

.aa-gate-signals {
  text-align: left;
  margin: 1.25rem 0;
  padding: 0;
  list-style: none;
}

.aa-gate-signals li {
  font-size: 0.85rem;
  color: var(--color-text-dim);
  padding: 0.3rem 0;
  padding-left: 1.25rem;
  position: relative;
}

.aa-gate-signals li::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-caution);
  transform: translateY(-50%);
}

.aa-gate-confidence {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  margin-bottom: 1.5rem;
}

.aa-gate-confidence--high {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.aa-gate-confidence--medium {
  background: rgba(234, 179, 8, 0.15);
  color: #eab308;
}

.aa-gate-actions {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
}

.aa-gate-analyze-btn {
  padding: 0.6rem 1.5rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  background: transparent;
  color: var(--color-text);
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s;
}

.aa-gate-analyze-btn:hover {
  background: var(--color-surface);
  border-color: var(--color-accent);
}

.aa-gate-try-link {
  font-size: 0.8rem;
  color: var(--color-accent);
  cursor: pointer;
  background: none;
  border: none;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Trust badge */
.aa-trust-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
}

.aa-trust-badge--verified {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
}

.aa-trust-badge--detected {
  background: rgba(144, 112, 212, 0.15);
  color: #9070d4;
}

.aa-trust-badge--unclassified {
  background: rgba(255, 255, 255, 0.08);
  color: var(--color-text-dim);
}
```

- [ ] **Step 2: Create AgentGate.tsx**

Create `src/app/components/AgentGate.tsx`:

```tsx
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

      <h2 className="aa-gate-title">This Doesn't Look Like an Agent</h2>

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
```

- [ ] **Step 3: Add badge type and forceAnalysis state to page.tsx**

In `src/app/page.tsx`, add to the `Home` component state:

```typescript
const [forceAnalysis, setForceAnalysis] = useState(false);
```

Import `AgentGate`:

```typescript
import { AgentGate } from "./components/AgentGate";
```

Add gate logic after result is set. In the render section where `TrustScoreCard` is shown, wrap with gate check:

```typescript
// Derive gate trigger and badge type from result
// walletClassification comes from dedicated state — see Step 4 below

const shouldGate =
  walletClassification &&
  walletClassification.humanScore > 70 &&
  walletClassification.confidence !== "LOW" &&
  !forceAnalysis;

// Derive badge type — agentIdentity comes from AnalyzeResponse, not UITrustScore
function deriveBadge(
  wc: WalletClassification | null,
  hasAgentIdentity: boolean,
): "verified" | "detected" | "unclassified" | null {
  if (hasAgentIdentity) return "verified";
  if (wc && wc.humanScore < 30) return "detected";
  if (wc && wc.humanScore >= 30 && wc.humanScore <= 70) return "unclassified";
  return null;
}
```

In the JSX, replace the `TrustScoreCard` render:

```tsx
{shouldGate ? (
  <AgentGate
    classification={walletClassification}
    onAnalyzeAnyway={() => setForceAnalysis(true)}
    onTryExample={() => {
      // Scroll to hero/input and pre-fill with example
      setForceAnalysis(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }}
  />
) : (
  result && (
    <>
      <TrustScoreCard score={result.trustScore} badge={deriveBadge(walletClassification, hasAgentIdentity)} />
      <TransactionTable ... />
    </>
  )
)}
```

Reset `forceAnalysis` when starting a new audit:

```typescript
// In runAudit(), at the top:
setForceAnalysis(false);
```

- [ ] **Step 4: Thread walletClassification through the response**

In `src/lib/types.ts`, add to `AnalyzeResponse`:

```typescript
readonly walletClassification?: WalletClassification;
```

In `src/app/api/analyze/route.ts`, include `walletClassification` in the response:

```typescript
// After metrics computation, walletClassification is on data.computedMetrics.walletClassification
walletClassification: data.computedMetrics?.walletClassification,
```

In `src/app/page.tsx`, store classification from response:

```typescript
// In the result state type, add walletClassification
const [walletClassification, setWalletClassification] = useState<WalletClassification | null>(null);
const [hasAgentIdentity, setHasAgentIdentity] = useState(false);

// In runAudit, after receiving response:
setWalletClassification(data.walletClassification ?? null);
setHasAgentIdentity(data.agentIdentity != null);
```

- [ ] **Step 5: Add badge prop to TrustScoreCard**

In `src/app/components/TrustScoreCard.tsx`, update the component props:

```typescript
interface TrustScoreCardProps {
  readonly score: UITrustScore;
  readonly badge?: "verified" | "detected" | "unclassified" | null;
}
```

Render the badge in the header section (next to the recommendation badge):

```tsx
{badge === "verified" && (
  <span className="aa-trust-badge aa-trust-badge--verified">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1l3.09 6.26L22 8.27l-5 4.87 1.18 6.88L12 16.77l-6.18 3.25L7 13.14 2 8.27l6.91-1.01L12 1z"/></svg>
    Verified Agent
  </span>
)}
{badge === "detected" && (
  <span className="aa-trust-badge aa-trust-badge--detected">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="12" rx="2"/><circle cx="9" cy="10" r="1.5" fill="currentColor"/><circle cx="15" cy="10" r="1.5" fill="currentColor"/></svg>
    Detected Agent
  </span>
)}
{badge === "unclassified" && (
  <span className="aa-trust-badge aa-trust-badge--unclassified">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    Unclassified
  </span>
)}
```

- [ ] **Step 6: Run typecheck**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/app/components/AgentGate.tsx src/app/page.tsx src/app/components/TrustScoreCard.tsx src/lib/types.ts src/app/api/analyze/route.ts src/app/globals.css
git commit -m "feat: add agent gate UI with human wallet rejection + trust badges"
```

---

## Task 3: Animated Loading State

**Files:**
- Modify: `src/app/components/LoadingState.tsx` (rewrite)
- Modify: `src/app/page.tsx` (5-step loading logic)
- Modify: `src/app/globals.css` (pulse ring + skeleton animations)

- [ ] **Step 1: Add loading animations to globals.css**

Append to `src/app/globals.css`:

```css
/* Loading pulse ring */
@keyframes aa-pulse-ring {
  0% { transform: scale(1); opacity: 0.6; }
  50% { transform: scale(1.8); opacity: 0; }
  100% { transform: scale(1); opacity: 0; }
}

.aa-loading-step {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 0;
  transition: opacity 0.3s;
}

.aa-loading-step--pending {
  opacity: 0.4;
}

.aa-loading-step--active {
  opacity: 1;
}

.aa-loading-step--complete {
  opacity: 0.8;
}

.aa-loading-dot {
  position: relative;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.aa-loading-dot--pending {
  background: var(--color-text-dim);
}

.aa-loading-dot--active {
  background: var(--color-accent);
}

.aa-loading-dot--active::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 2px solid var(--color-accent);
  animation: aa-pulse-ring 1.5s ease-out infinite;
}

.aa-loading-dot--complete {
  background: #22c55e;
}

@keyframes aa-check-scale {
  0% { transform: scale(0); }
  60% { transform: scale(1.2); }
  100% { transform: scale(1); }
}

.aa-loading-check {
  animation: aa-check-scale 0.3s ease-out;
}

.aa-loading-label {
  font-size: 0.85rem;
}

.aa-loading-label--pending {
  color: var(--color-text-dim);
}

.aa-loading-label--active {
  color: var(--color-text);
}

.aa-loading-label--complete {
  color: #22c55e;
}

.aa-loading-detail {
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin-left: 1.6rem;
  margin-top: -0.25rem;
}

/* Skeleton */
@keyframes aa-skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.7; }
}

.aa-skeleton {
  margin-top: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 36rem;
}

.aa-skeleton-bar {
  height: 1rem;
  border-radius: 0.5rem;
  background: var(--color-surface-alt);
  animation: aa-skeleton-pulse 1.5s ease-in-out infinite;
}

.aa-loading-hint {
  font-size: 0.75rem;
  color: var(--color-text-dim);
  margin-top: 1.5rem;
  text-align: center;
}
```

- [ ] **Step 2: Rewrite LoadingState.tsx**

Replace `src/app/components/LoadingState.tsx`:

```tsx
"use client";

export interface LoadingStep {
  readonly label: string;
  readonly detail?: string;
  readonly status: "pending" | "active" | "complete";
}

interface LoadingStateProps {
  readonly steps: readonly LoadingStep[];
}

export function LoadingState({ steps }: LoadingStateProps) {
  return (
    <div style={{ maxWidth: "28rem", margin: "2rem auto" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        {steps.map((step, i) => (
          <div key={i}>
            <div className={`aa-loading-step aa-loading-step--${step.status}`}>
              {step.status === "complete" ? (
                <svg className="aa-loading-check" width="10" height="10" viewBox="0 0 16 16" fill="#22c55e">
                  <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                </svg>
              ) : (
                <div className={`aa-loading-dot aa-loading-dot--${step.status}`} />
              )}
              <span className={`aa-loading-label aa-loading-label--${step.status}`}>
                {step.label}
              </span>
            </div>
            {step.status === "complete" && step.detail && (
              <div className="aa-loading-detail">{step.detail}</div>
            )}
          </div>
        ))}
      </div>

      {/* Skeleton placeholder */}
      <div className="aa-skeleton">
        <div className="aa-skeleton-bar" style={{ width: "100%" }} />
        <div className="aa-skeleton-bar" style={{ width: "85%" }} />
        <div className="aa-skeleton-bar" style={{ width: "70%" }} />
        <div style={{ display: "flex", gap: "1rem" }}>
          <div className="aa-skeleton-bar" style={{ width: "45%", height: "4rem" }} />
          <div className="aa-skeleton-bar" style={{ width: "45%", height: "4rem" }} />
        </div>
        <div className="aa-skeleton-bar" style={{ width: "60%" }} />
      </div>

      <p className="aa-loading-hint">Analysis typically takes 10-20 seconds</p>
    </div>
  );
}
```

- [ ] **Step 3: Update page.tsx loading steps to 5 steps**

In `src/app/page.tsx`, update the `loadingSteps` state initialization and timer logic in `runAudit`:

```typescript
const [loadingSteps, setLoadingSteps] = useState<LoadingStep[]>([
  { label: "Resolving address...", status: "pending" },
  { label: "Scanning network...", status: "pending" },
  { label: "Fetching on-chain data...", status: "pending" },
  { label: "Running AI analysis...", status: "pending" },
  { label: "Building intelligence report...", status: "pending" },
]);
```

Update the timer logic in `runAudit` to advance through 5 steps:

```typescript
// Reset steps
setLoadingSteps([
  { label: "Resolving address...", status: "active" },
  { label: "Scanning network...", status: "pending" },
  { label: "Fetching on-chain data...", status: "pending" },
  { label: "Running AI analysis...", status: "pending" },
  { label: "Building intelligence report...", status: "pending" },
]);

// Step 1 → 2 at 800ms
const t1 = setTimeout(() => {
  setLoadingSteps((prev) => prev.map((s, i) =>
    i === 0 ? { ...s, status: "complete" as const, detail: "Address resolved" }
    : i === 1 ? { ...s, status: "active" as const, label: "Scanning network..." }
    : s
  ));
}, 800);

// Step 2 → 3 at 2s
const t2 = setTimeout(() => {
  setLoadingSteps((prev) => prev.map((s, i) =>
    i === 1 ? { ...s, status: "complete" as const, detail: "Transactions found" }
    : i === 2 ? { ...s, status: "active" as const }
    : s
  ));
}, 2000);

// Step 3 → 4 at 3s
const t3 = setTimeout(() => {
  setLoadingSteps((prev) => prev.map((s, i) =>
    i === 2 ? { ...s, status: "complete" as const, detail: "Data assembled" }
    : i === 3 ? { ...s, status: "active" as const }
    : s
  ));
}, 3000);
```

After the fetch completes successfully:

```typescript
// Clear timers
[t1, t2, t3].forEach(clearTimeout);

// Complete step 4
setLoadingSteps((prev) => prev.map((s, i) =>
  i <= 2 ? { ...s, status: "complete" as const }
  : i === 3 ? { ...s, status: "complete" as const, detail: "Analysis complete" }
  : i === 4 ? { ...s, status: "active" as const }
  : s
));

// Step 5 completes after 500ms
await new Promise((r) => setTimeout(r, 500));
setLoadingSteps((prev) => prev.map((s) => ({ ...s, status: "complete" as const })));
```

Import the updated `LoadingStep` type:

```typescript
import { LoadingState, type LoadingStep } from "./components/LoadingState";
```

- [ ] **Step 4: Run typecheck**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/components/LoadingState.tsx src/app/page.tsx src/app/globals.css
git commit -m "feat: 5-step animated loading with skeleton placeholder"
```

---

## Task 4: Venice Prompt Enhancement

**Files:**
- Modify: `src/lib/types.ts` (add `ActivityProfile` type, add to `TrustScore`)
- Modify: `src/lib/venice.ts` (update SYSTEM_PROMPT + normalizeVeniceResponse)
- Modify: `src/lib/trust-score.ts` (pass activityProfile through formatForUI)

- [ ] **Step 1: Add ActivityProfile type to types.ts**

In `src/lib/types.ts`, add the type and add it to `TrustScore`:

```typescript
export interface ProtocolShare {
  readonly protocol: string;
  readonly percentage: number;
  readonly action: string;
}

export interface ActivityProfile {
  readonly primaryActivity: string;
  readonly strategies: readonly string[];
  readonly protocolBreakdown: readonly ProtocolShare[];
  readonly riskBehaviors: readonly string[];
  readonly successMetrics: string;
}
```

Add to `TrustScore`:

```typescript
readonly activityProfile?: ActivityProfile;
```

Add to `UITrustScore`:

```typescript
readonly activityProfile?: ActivityProfile;
```

- [ ] **Step 2: Update SYSTEM_PROMPT in venice.ts**

In `src/lib/venice.ts`, add to the JSON template section of `SYSTEM_PROMPT`:

```
"activityProfile": {
  "primaryActivity": "One sentence: what this agent does on-chain",
  "strategies": ["Specific strategy 1", "Strategy 2"],
  "protocolBreakdown": [{"protocol": "Protocol Name", "percentage": 65, "action": "What it does there"}],
  "riskBehaviors": ["List any risky patterns observed"],
  "successMetrics": "Concrete success metrics from the data"
}
```

Add this instruction to the SYSTEM_PROMPT near the behavioral narrative section:

```
Your behavioralNarrative MUST be specific to this agent's actual data. Never use generic phrases like "shows mostly normal behavior" or "minor anomalies detected". Instead describe: what the agent does, how often, which protocols, what strategy, and any notable patterns. Example: "This keeper bot executes Chainlink automation tasks every 4.2 hours with 98% consistency, primarily servicing price feed updates on Aave V3 and Compound V3 markets."
```

- [ ] **Step 3: Update normalizeVeniceResponse to handle activityProfile**

In the `normalizeVeniceResponse` function, add after existing field normalization:

```typescript
const activityProfile: ActivityProfile | undefined = raw.activityProfile
  ? {
      primaryActivity: raw.activityProfile.primaryActivity || "Unknown activity",
      strategies: Array.isArray(raw.activityProfile.strategies) ? raw.activityProfile.strategies : [],
      protocolBreakdown: Array.isArray(raw.activityProfile.protocolBreakdown)
        ? raw.activityProfile.protocolBreakdown.map((p: any) => ({
            protocol: p.protocol || "Unknown",
            percentage: typeof p.percentage === "number" ? p.percentage : 0,
            action: p.action || "Unknown",
          }))
        : [],
      riskBehaviors: Array.isArray(raw.activityProfile.riskBehaviors) ? raw.activityProfile.riskBehaviors : [],
      successMetrics: raw.activityProfile.successMetrics || "",
    }
  : undefined;
```

Include `activityProfile` in the returned object.

- [ ] **Step 4: Pass activityProfile through formatForUI**

In `src/lib/trust-score.ts`, in the `formatForUI` function, add to the returned `UITrustScore`:

```typescript
activityProfile: score.activityProfile,
```

- [ ] **Step 5: Run typecheck**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/venice.ts src/lib/trust-score.ts
git commit -m "feat: enhance Venice prompt with activityProfile + specific narratives"
```

---

## Task 5: Agent Identity Header

**Files:**
- Modify: `src/app/components/TrustScoreCard.tsx` (replace header + classification panel)

**Depends on:** Task 2 (badge prop)

- [ ] **Step 1: Replace the header section in TrustScoreCard.tsx**

Find the current agent header section (address display + classification panel) and replace with a unified identity header:

```tsx
{/* Identity Header */}
<div style={{ display: "flex", alignItems: "flex-start", gap: "1rem", marginBottom: "1.5rem" }}>
  {/* Left: Agent type icon */}
  <div style={{ flexShrink: 0 }}>
    <AgentTypeShape type={agentType} />
  </div>

  {/* Center: Identity info */}
  <div style={{ flex: 1, minWidth: 0 }}>
    {/* Line 1: Agent type as title */}
    <h2 style={{
      fontFamily: "var(--font-display)",
      fontSize: "1.4rem",
      color: AGENT_TYPE_META[agentType]?.color || "var(--color-text)",
      margin: 0,
    }}>
      {AGENT_TYPE_META[agentType]?.label || agentType}
    </h2>

    {/* Line 2: Address + chain */}
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
        {score.address.slice(0, 6)}...{score.address.slice(-4)}
      </span>
      <button
        onClick={() => { navigator.clipboard.writeText(score.address); }}
        style={{ background: "none", border: "none", color: "var(--color-text-dim)", cursor: "pointer", padding: "2px" }}
        title="Copy address"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      </button>
      <span style={{
        fontSize: "0.65rem",
        padding: "0.15rem 0.4rem",
        borderRadius: "4px",
        background: "rgba(144, 112, 212, 0.15)",
        color: "var(--color-accent)",
        fontWeight: 600,
      }}>
        {score.chainName}
      </span>
    </div>

    {/* Line 3: Protocol tags */}
    {score.protocolsUsed && score.protocolsUsed.length > 0 && (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.5rem" }}>
        {score.protocolsUsed.slice(0, 5).map((protocol) => (
          <span key={protocol} style={{
            fontSize: "0.65rem",
            padding: "0.15rem 0.45rem",
            borderRadius: "9999px",
            background: "var(--color-surface)",
            color: "var(--color-text-dim)",
            border: "1px solid var(--color-border)",
          }}>
            {protocol}
          </span>
        ))}
      </div>
    )}
  </div>

  {/* Right: Trust badge */}
  <div style={{ flexShrink: 0 }}>
    {/* Badge from Task 2 — already rendered */}
  </div>
</div>
```

Remove the separate "Agent Classification" panel that follows the header (the section showing agent type shape + label + HumanWalletIndicator + performance score). Move the performance score display into the score ring section.

- [ ] **Step 2: Run typecheck**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/components/TrustScoreCard.tsx
git commit -m "feat: unified agent identity header replacing separate classification panel"
```

---

## Task 6: Score Breakdown Explanations

**Files:**
- Modify: `src/app/components/TrustScoreCard.tsx` (add explanations below breakdown bars)

- [ ] **Step 1: Add explanation map and render below each BreakdownBar**

In `TrustScoreCard.tsx`, add the constant:

```typescript
const BREAKDOWN_EXPLANATIONS: Record<string, string> = {
  "Transaction Patterns": "Timing regularity, gas efficiency, volume consistency, and nonce sequence analysis",
  "Contract Interactions": "Protocol diversity, verified vs unverified contracts, and proxy usage patterns",
  "Fund Flow": "Source legitimacy, destination analysis, circular patterns, and sudden large transfers",
  "Behavioral Consistency": "Alignment between declared purpose and actual on-chain behavior over time",
};
```

In the score breakdown section, after each `BreakdownBar`, add:

```tsx
{BREAKDOWN_EXPLANATIONS[axis.label] && (
  <p style={{
    fontSize: "0.7rem",
    color: "var(--color-text-dim)",
    margin: "0.15rem 0 0.5rem 0",
    maxWidth: "24rem",
    lineHeight: 1.3,
  }}>
    {BREAKDOWN_EXPLANATIONS[axis.label]}
  </p>
)}
```

Also add success rate display in the breakdown section:

```tsx
{score.successRate !== undefined && (
  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.75rem" }}>
    <span style={{
      width: "8px",
      height: "8px",
      borderRadius: "50%",
      background: score.successRate >= 0.9 ? "#22c55e" : score.successRate >= 0.7 ? "#eab308" : "#ef4444",
    }} />
    <span style={{ fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
      Success Rate: {(score.successRate * 100).toFixed(1)}%
    </span>
  </div>
)}
```

Note: `successRate` lives on `AgentMetrics`, not `TrustScore`. Thread it through:

1. In `src/lib/types.ts`, add to `AnalyzeResponse`:
```typescript
readonly successRate?: number;
```

2. In `src/app/api/analyze/route.ts`, include in response:
```typescript
successRate: data.computedMetrics?.successRate,
```

3. In `src/lib/types.ts`, add to `UITrustScore`:
```typescript
readonly successRate?: number;
```

4. In `src/lib/trust-score.ts`, update `formatForUI` to accept optional `successRate` param:
```typescript
export function formatForUI(score: TrustScore, successRate?: number): UITrustScore {
  // ... existing code ...
  return { ...existing, successRate };
}
```

5. In `src/app/page.tsx`, pass it through:
```typescript
const uiScore = formatForUI(data.trustScore, data.successRate);
```

- [ ] **Step 2: Run typecheck**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add src/app/components/TrustScoreCard.tsx src/lib/types.ts src/lib/trust-score.ts
git commit -m "feat: add score breakdown explanations + success rate indicator"
```

---

## Task 7: Rich Activity Profile Component

**Files:**
- Create: `src/app/components/ActivityProfile.tsx`
- Modify: `src/app/components/TrustScoreCard.tsx` (import and render)
- Modify: `src/app/globals.css` (activity profile styles)

**Depends on:** Task 4 (activityProfile type on UITrustScore)

- [ ] **Step 1: Add styles to globals.css**

Append to `src/app/globals.css`:

```css
/* Activity Profile */
.aa-activity-primary {
  font-family: var(--font-display);
  font-size: 1.15rem;
  color: var(--color-text);
  margin-bottom: 0.75rem;
}

.aa-strategy-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-bottom: 1rem;
}

.aa-strategy-tag {
  font-size: 0.7rem;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  background: rgba(144, 112, 212, 0.12);
  color: var(--color-accent);
  border: 1px solid rgba(144, 112, 212, 0.2);
}

.aa-protocol-bar {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.aa-protocol-entry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.aa-protocol-name {
  min-width: 6rem;
  color: var(--color-text-muted);
  font-weight: 500;
}

.aa-protocol-pct-bar {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: var(--color-surface);
  overflow: hidden;
}

.aa-protocol-pct-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--color-accent);
  transition: width 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.aa-protocol-action {
  font-size: 0.7rem;
  color: var(--color-text-dim);
  min-width: 8rem;
}

.aa-success-metrics {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-style: italic;
  margin-bottom: 0.75rem;
}

.aa-risk-tag {
  font-size: 0.7rem;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  background: rgba(234, 179, 8, 0.12);
  color: var(--color-caution);
  border: 1px solid rgba(234, 179, 8, 0.2);
}
```

- [ ] **Step 2: Create ActivityProfile.tsx**

Create `src/app/components/ActivityProfile.tsx`:

```tsx
"use client";

import type { ActivityProfile as ActivityProfileType } from "../../lib/types";

interface ActivityProfileProps {
  readonly profile?: ActivityProfileType;
  readonly narrativeFallback?: string;
}

export function ActivityProfile({ profile, narrativeFallback }: ActivityProfileProps) {
  if (!profile) {
    // Fallback to behavioral narrative blockquote
    return narrativeFallback ? (
      <blockquote style={{
        borderLeft: "3px solid var(--color-accent)",
        paddingLeft: "1rem",
        margin: "0.75rem 0",
        color: "var(--color-text-muted)",
        fontSize: "0.85rem",
        fontStyle: "italic",
      }}>
        {narrativeFallback}
      </blockquote>
    ) : null;
  }

  return (
    <div>
      {/* Primary Activity */}
      <p className="aa-activity-primary">{profile.primaryActivity}</p>

      {/* Strategy Tags */}
      {profile.strategies.length > 0 && (
        <div className="aa-strategy-tags">
          {profile.strategies.map((s, i) => (
            <span key={i} className="aa-strategy-tag">{s}</span>
          ))}
        </div>
      )}

      {/* Protocol Breakdown */}
      {profile.protocolBreakdown.length > 0 && (
        <div className="aa-protocol-bar">
          {profile.protocolBreakdown.map((entry, i) => (
            <div key={i} className="aa-protocol-entry">
              <span className="aa-protocol-name">{entry.protocol}</span>
              <div className="aa-protocol-pct-bar">
                <div
                  className="aa-protocol-pct-fill"
                  style={{ width: `${Math.min(entry.percentage, 100)}%` }}
                />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem", color: "var(--color-text-dim)", minWidth: "2.5rem", textAlign: "right" }}>
                {entry.percentage}%
              </span>
              <span className="aa-protocol-action">{entry.action}</span>
            </div>
          ))}
        </div>
      )}

      {/* Success Metrics */}
      {profile.successMetrics && (
        <p className="aa-success-metrics">{profile.successMetrics}</p>
      )}

      {/* Risk Behaviors */}
      {profile.riskBehaviors.length > 0 && (
        <div className="aa-strategy-tags">
          {profile.riskBehaviors.map((r, i) => (
            <span key={i} className="aa-risk-tag">{r}</span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Replace behavioral narrative in TrustScoreCard.tsx**

Import `ActivityProfile`:

```typescript
import { ActivityProfile } from "./ActivityProfile";
```

Replace the behavioral narrative blockquote section with:

```tsx
<ActivityProfile
  profile={score.activityProfile}
  narrativeFallback={score.behavioralNarrative}
/>
```

- [ ] **Step 4: Run typecheck**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add src/app/components/ActivityProfile.tsx src/app/components/TrustScoreCard.tsx src/app/globals.css
git commit -m "feat: rich activity profile component replacing generic narrative"
```

---

## Task 8: Contextual Financial Intel

**Files:**
- Modify: `src/app/components/TrustScoreCard.tsx` (add interpretive labels to financial panel)

- [ ] **Step 1: Add label helper functions**

In `TrustScoreCard.tsx`, add these pure functions:

```typescript
function gasLabel(ethValue: number): string {
  if (ethValue < 0.01) return "Minimal activity";
  if (ethValue < 0.1) return "Light spender";
  if (ethValue < 1.0) return "Moderate spender";
  if (ethValue < 10) return "Heavy spender";
  return "Whale-tier gas usage";
}

function netFlowLabel(ethValue: number): { text: string; color: string; arrow: string } {
  if (Math.abs(ethValue) < 0.001) return { text: "Neutral flow", color: "var(--color-text-dim)", arrow: "—" };
  if (ethValue > 0) return { text: "Net accumulator", color: "#22c55e", arrow: "\u2191" };
  return { text: "Net spender", color: "#ef4444", arrow: "\u2193" };
}

function txSizeLabel(ethValue: number): string {
  if (ethValue < 0.01) return "Micro transactions";
  if (ethValue < 1) return "Standard range";
  if (ethValue < 10) return "Significant";
  return "Whale-sized";
}
```

- [ ] **Step 2: Render labels below each financial value**

Find the financial intel section. Below each value display, add a muted label line:

For gas spent:

```tsx
<span style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", display: "block", marginTop: "0.15rem" }}>
  {gasLabel(parseFloat(score.financialSummary.totalGasSpentETH || "0"))}
</span>
```

For net flow:

```tsx
{(() => {
  const flow = netFlowLabel(parseFloat(score.financialSummary.netFlowETH || "0"));
  return (
    <span style={{ fontSize: "0.7rem", color: flow.color, display: "block", marginTop: "0.15rem" }}>
      {flow.arrow} {flow.text}
    </span>
  );
})()}
```

For largest tx:

```tsx
<span style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", display: "block", marginTop: "0.15rem" }}>
  {txSizeLabel(parseFloat(score.financialSummary.largestSingleTxETH || "0"))}
</span>
```

- [ ] **Step 3: Run typecheck**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/app/components/TrustScoreCard.tsx
git commit -m "feat: contextual financial labels (gas, net flow, tx size)"
```

---

## Task 9: Human-Readable Transaction Table

**Files:**
- Create: `src/lib/method-labels.ts`
- Modify: `src/app/components/TransactionTable.tsx` (action column + success indicator)

- [ ] **Step 1: Create method-labels.ts**

Create `src/lib/method-labels.ts`:

```typescript
export interface MethodLabel {
  readonly verb: string;
  readonly protocol: string;
}

export const METHOD_LABELS: Record<string, MethodLabel> = {
  "0xa9059cbb": { verb: "Transferred", protocol: "ERC-20" },
  "0x095ea7b3": { verb: "Approved", protocol: "ERC-20" },
  "0x23b872dd": { verb: "Transferred (from)", protocol: "ERC-20" },
  "0x7ff36ab5": { verb: "Swapped ETH \u2192", protocol: "Uniswap V2" },
  "0x38ed1739": { verb: "Swapped tokens", protocol: "Uniswap V2" },
  "0x18cbafe5": { verb: "Swapped \u2192 ETH", protocol: "Uniswap V2" },
  "0x414bf389": { verb: "Swapped (exact)", protocol: "Uniswap V3" },
  "0xc04b8d59": { verb: "Swapped (multi-hop)", protocol: "Uniswap V3" },
  "0x5ae401dc": { verb: "Multicall swap", protocol: "Uniswap V3" },
  "0x617ba037": { verb: "Supplied collateral", protocol: "Aave V3" },
  "0xa415bcad": { verb: "Borrowed", protocol: "Aave V3" },
  "0x69328dec": { verb: "Withdrew", protocol: "Aave V3" },
  "0xe8eda9df": { verb: "Repaid", protocol: "Aave V3" },
  "0xf2b9fdb8": { verb: "Supplied", protocol: "Compound V3" },
  "0xf3fef3a3": { verb: "Withdrew", protocol: "Compound V3" },
  "0xd0e30db0": { verb: "Wrapped ETH", protocol: "WETH" },
  "0x2e1a7d4d": { verb: "Unwrapped ETH", protocol: "WETH" },
  "0x12aa3caf": { verb: "Swapped", protocol: "1inch" },
  "0xe449022e": { verb: "Swapped (Unoswap)", protocol: "1inch" },
  "0x6a761202": { verb: "Executed multisig tx", protocol: "Gnosis Safe" },
  "0x4585e33b": { verb: "Performed upkeep", protocol: "Chainlink" },
  "0x1fad948c": { verb: "Handled user op", protocol: "ERC-4337" },
};

export function getMethodLabel(methodId: string | undefined): MethodLabel | null {
  if (!methodId) return null;
  const key = methodId.slice(0, 10).toLowerCase();
  return METHOD_LABELS[key] ?? null;
}
```

- [ ] **Step 2: Add Action column and success indicator to TransactionTable.tsx**

In `src/app/components/TransactionTable.tsx`:

Import:

```typescript
import { getMethodLabel } from "../../lib/method-labels";
```

Add "Action" header between "Hash" and "From" in the thead:

```tsx
<th>Action</th>
```

Add "Status" header before "Time":

```tsx
<th style={{ width: "2rem" }}></th>
```

In each row, add the Action cell after Hash:

```tsx
<td>
  {(() => {
    const label = getMethodLabel(tx.methodId);
    if (label) {
      return (
        <span style={{ fontSize: "0.75rem" }}>
          <span style={{ color: "var(--color-accent)" }}>{label.verb}</span>
          <span style={{ color: "var(--color-text-dim)" }}> on {label.protocol}</span>
        </span>
      );
    }
    return (
      <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.7rem", color: "var(--color-text-dim)" }}>
        {tx.methodId ? tx.methodId.slice(0, 10) : "0x"}
      </span>
    );
  })()}
</td>
```

Add success indicator cell before Time:

```tsx
<td style={{ textAlign: "center" }}>
  <span
    style={{
      display: "inline-block",
      width: "6px",
      height: "6px",
      borderRadius: "50%",
      background: tx.success ? "#22c55e" : "#ef4444",
    }}
    title={tx.success ? "Success" : "Failed"}
  />
</td>
```

- [ ] **Step 3: Run typecheck**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/method-labels.ts src/app/components/TransactionTable.tsx
git commit -m "feat: human-readable tx action labels + success indicators"
```

---

## Task 10: ETH Price Context

**Files:**
- Create: `src/lib/price.ts`
- Modify: `src/lib/types.ts` (add ethPrice to UITrustScore)
- Modify: `src/app/api/analyze/route.ts` (call getETHPrice)
- Modify: `src/lib/trust-score.ts` (pass ethPrice through formatForUI)
- Modify: `src/app/components/TrustScoreCard.tsx` (show USD values)

- [ ] **Step 1: Create price.ts**

Create `src/lib/price.ts`:

```typescript
let cachedPrice: { readonly usd: number; readonly timestamp: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getETHPrice(): Promise<number | null> {
  if (cachedPrice && Date.now() - cachedPrice.timestamp < CACHE_TTL) {
    return cachedPrice.usd;
  }
  try {
    const res = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd",
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return cachedPrice?.usd ?? null;
    const data = await res.json();
    const usd = data?.ethereum?.usd;
    if (typeof usd !== "number") return cachedPrice?.usd ?? null;
    cachedPrice = { usd, timestamp: Date.now() };
    return usd;
  } catch {
    return cachedPrice?.usd ?? null;
  }
}
```

- [ ] **Step 2: Add ethPrice to types and formatForUI**

In `src/lib/types.ts`, add to `UITrustScore`:

```typescript
readonly ethPrice?: number;
```

In `src/lib/types.ts`, add to `AnalyzeResponse`:

```typescript
readonly ethPrice?: number;
```

In `src/lib/trust-score.ts`, update `formatForUI` signature to also accept optional ethPrice (Task 6 already added `successRate` param):

```typescript
export function formatForUI(score: TrustScore, successRate?: number, ethPrice?: number): UITrustScore {
```

Add to returned object:

```typescript
ethPrice,
```

- [ ] **Step 3: Call getETHPrice in API route**

In `src/app/api/analyze/route.ts`:

Import:

```typescript
import { getETHPrice } from "../../../lib/price";
```

Call `getETHPrice()` early in the route handler, before the mock/real Venice branching logic. Do NOT wrap it in `Promise.all` with the Venice call — just call it independently:

```typescript
// Near the top of the handler, after fetchAgentData:
const ethPrice = await getETHPrice();
```

Then include in the response object at the end:

```typescript
ethPrice: ethPrice ?? undefined,
```

This avoids restructuring the existing mock/real Venice branching logic.

- [ ] **Step 4: Pass ethPrice through page.tsx to formatForUI**

In `src/app/page.tsx`, when calling `formatForUI` (Task 6 added successRate as first extra param):

```typescript
const uiScore = formatForUI(data.trustScore, data.successRate, data.ethPrice);
```

- [ ] **Step 5: Show USD values in TrustScoreCard**

In the financial intel section, below each ETH value, add USD conversion:

```tsx
{score.ethPrice && (
  <span style={{ fontSize: "0.7rem", color: "var(--color-text-dim)", display: "block" }}>
    ~${(parseFloat(ethValueString) * score.ethPrice).toLocaleString(undefined, { maximumFractionDigits: 2 })}
  </span>
)}
```

Apply this pattern to gas spent, net flow, and largest tx values.

- [ ] **Step 6: Run typecheck**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

- [ ] **Step 7: Commit**

```bash
git add src/lib/price.ts src/lib/types.ts src/lib/trust-score.ts src/app/api/analyze/route.ts src/app/page.tsx src/app/components/TrustScoreCard.tsx
git commit -m "feat: ETH price context with USD conversion via CoinGecko"
```

---

## Dependency Graph

```
Task 1 (Classifier) ──┬──→ Task 2 (Gate UI) ──→ Task 5 (Identity Header)
                       │
Task 3 (Loading) ──────┤   (independent)
                       │
Task 4 (Venice) ───────┴──→ Task 7 (Activity Profile)

Task 6 (Breakdown) ────────  (independent, after Task 1 for successRate passthrough)
Task 8 (Financial) ────────  (independent)
Task 9 (Tx Table) ─────────  (independent)
Task 10 (ETH Price) ───────  (independent, touches API route)
```

**Parallel groups:**
- Group A: Task 1 (must be first)
- Group B (after Task 1): Tasks 2, 3, 4, 6, 8, 9, 10 can run in parallel
- Group C (after Tasks 2+4): Tasks 5, 7

**Recommended serial order for single-agent execution:**
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
