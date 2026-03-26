# AgentAuditor Accuracy Fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two accuracy bugs — (A) the app treats a ~100 tx sample as complete history, and (B) protocol contracts get called "agents" — by threading sample context and entity classification through the pipeline.

**Architecture:** Work Item A adds `SampleContext` (total tx count vs sample size) computed in metrics.ts and threaded to Venice prompt + UI. Work Item B adds a new `entity-classifier.ts` with a waterfall classifier that determines if an address is an agent, protocol contract, user wallet, or unknown, then adjusts Venice framing and Telegram/UI formatting. Both changes are additive — no existing behavior removed.

**Tech Stack:** TypeScript, Next.js App Router, Bun test runner, Venice AI (OpenAI-compatible API)

**Spec:** `docs/superpowers/specs/2026-03-27-accuracy-fixes-design.md`

**Sacred Constraints:** DO NOT change `SYSTEM_PROMPT` (venice.ts:85-131), worked examples (venice.ts:133-183), `max_tokens: 4096`, or `temperature: 0.7`.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/types.ts` | Edit | Add `EntityType`, `EntityClassification`, `SampleContext` types; add optional fields to 7 existing interfaces |
| `src/lib/metrics.ts` | Edit | Add `computeSampleContext()` function; thread `sampleContext` into `computeMetrics()` return |
| `src/lib/behavioral-profile.ts` | Edit | Add 7th param `totalTransactionCount`; thread `sampleContext` + `sampleWindowDays` into return |
| `src/lib/entity-classifier.ts` | **Create** | `computeFromRatio()`, `classifyEntityType()`, `EntityClassifierInput` |
| `src/lib/venice.ts` | Edit | Add DATA WINDOW section, ENTITY CLASSIFICATION section, fix tx count annotation, fix AGENT BIOGRAPHY |
| `src/lib/trust-score.ts` | Edit | Entity-aware title in `formatForTelegram()`, entity pass-through in `formatForUI()` |
| `src/app/api/analyze/route.ts` | Edit | Thread `totalTxCount` to behavioral profile, call `classifyEntityType`, rename `totalTransactionCount` → `fetchedTransactionCount`, add new fields to response |
| `src/app/dashboard/page.tsx` | Edit | Rename `totalTransactionCount` → `fetchedTransactionCount` references |
| `src/__tests__/sample-context.test.ts` | **Create** | 5 tests for `computeSampleContext()` |
| `src/__tests__/entity-classifier.test.ts` | **Create** | 16 tests (5 `computeFromRatio` + 11 `classifyEntityType`) |
| `src/__tests__/venice-prompt-sections.test.ts` | **Create** | 7 tests for DATA WINDOW + ENTITY CLASSIFICATION prompt assembly |

---

## Task 1: Add New Types to `types.ts`

**Files:**
- Modify: `src/lib/types.ts:41` (after AgentType), `src/lib/types.ts:131` (AgentMetrics), `src/lib/types.ts:205` (BehavioralProfile), `src/lib/types.ts:246` (AgentTransactionData), `src/lib/types.ts:302` (TrustScore), `src/lib/types.ts:425` (AnalyzeResponse), `src/lib/types.ts:449` (UITrustScore), `src/lib/types.ts:502` (AuditRecord)

- [ ] **Step 1: Add EntityType, EntityClassification, SampleContext after line 41**

After the `AgentType` union (line 41), add:

```typescript
// ─── Entity Classification ──────────────────────────────────────────────────

export type EntityType = "AUTONOMOUS_AGENT" | "PROTOCOL_CONTRACT" | "USER_WALLET" | "UNKNOWN";

export interface EntityClassification {
  readonly entityType: EntityType;
  readonly confidence: "LOW" | "MEDIUM" | "HIGH" | "DEFINITIVE";
  readonly signals: readonly string[];
  readonly fromRatio: number;        // 0.0-1.0: fraction of txs where address is tx.from
  readonly primarySignal: string;    // the signal that determined classification
}

// ─── Sample Context ─────────────────────────────────────────────────────────

export interface SampleContext {
  readonly totalTransactionCount: number;   // from addressInfo.transactionsCount (real Blockscout total)
  readonly sampleSize: number;              // transactions.length (what we actually fetched)
  readonly sampleCoveragePercent: number;   // (sampleSize / totalTransactionCount) * 100
  readonly isSampleDerived: boolean;        // true when sampleSize < totalTransactionCount
}
```

- [ ] **Step 2: Add optional fields to AgentMetrics (line 131)**

After `readonly consistencyScore: number;` (line 148), add:

```typescript
  readonly sampleContext?: SampleContext;
  readonly earliestSampleTimestamp: number | null;
```

- [ ] **Step 3: Add optional fields to BehavioralProfile (line 205)**

After `readonly longestDormancy: ...` (line 218), add:

```typescript
  readonly sampleContext?: SampleContext;
  readonly sampleWindowDays?: number;
```

- [ ] **Step 4: Add optional fields to AgentTransactionData (line 246)**

After `readonly addressInfo?: AddressInfo;` (line 256), add:

```typescript
  readonly entityClassification?: EntityClassification;
  readonly sampleContext?: SampleContext;
```

- [ ] **Step 5: Add optional fields to TrustScore (line 302)**

After `readonly balanceTrend?: ...` (line 345), add:

```typescript
  readonly entityType?: EntityType;
  readonly entityClassification?: EntityClassification;
```

- [ ] **Step 6: Rename + add fields on AnalyzeResponse (line 425)**

Rename `totalTransactionCount` to `fetchedTransactionCount` on line 429:

```typescript
  readonly fetchedTransactionCount?: number;  // was totalTransactionCount — sample size
```

After `ensName` (line 436), add:

```typescript
  readonly entityType?: EntityType;
  readonly entityClassification?: EntityClassification;
  readonly sampleContext?: SampleContext;
```

- [ ] **Step 7: Add optional fields to UITrustScore (line 449)**

After `readonly behavioralProfile?: BehavioralProfile;` (line 497), add:

```typescript
  readonly entityType?: EntityType;
  readonly entityClassification?: EntityClassification;
  readonly sampleContext?: SampleContext;
```

- [ ] **Step 8: Add optional field to AuditRecord (line 502)**

After `readonly agentType: AgentType;` (line 508), add:

```typescript
  readonly entityType?: EntityType;
```

- [ ] **Step 9: Run typecheck**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

Expected: Should pass — all new fields are optional, no consumers break.

- [ ] **Step 10: Commit**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor
git add src/lib/types.ts
git commit -m "feat: add EntityType, EntityClassification, SampleContext types

Add new types for accuracy fixes. EntityType classifies addresses as
AUTONOMOUS_AGENT, PROTOCOL_CONTRACT, USER_WALLET, or UNKNOWN.
SampleContext tracks total vs fetched tx count. Optional fields added
to AgentMetrics, BehavioralProfile, AgentTransactionData, TrustScore,
AnalyzeResponse, UITrustScore, AuditRecord. Renamed totalTransactionCount
to fetchedTransactionCount on AnalyzeResponse to avoid collision."
```

---

## Task 2: Write Sample Context Tests + Implementation

**Files:**
- Create: `src/__tests__/sample-context.test.ts`
- Modify: `src/lib/metrics.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/sample-context.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { computeSampleContext } from "../lib/metrics";

describe("computeSampleContext", () => {
  test("100 sample from 9.7M total → tiny coverage, isSampleDerived=true", () => {
    const ctx = computeSampleContext(100, 9_700_000);
    expect(ctx.totalTransactionCount).toBe(9_700_000);
    expect(ctx.sampleSize).toBe(100);
    expect(ctx.sampleCoveragePercent).toBeCloseTo(0.001, 2);
    expect(ctx.isSampleDerived).toBe(true);
  });

  test("100/100 → full coverage, isSampleDerived=false", () => {
    const ctx = computeSampleContext(100, 100);
    expect(ctx.sampleCoveragePercent).toBe(100);
    expect(ctx.isSampleDerived).toBe(false);
  });

  test("100 sample but totalTransactionCount=0 → effectiveTotal=100, full coverage", () => {
    const ctx = computeSampleContext(100, 0);
    expect(ctx.totalTransactionCount).toBe(100);
    expect(ctx.sampleCoveragePercent).toBe(100);
    expect(ctx.isSampleDerived).toBe(false);
  });

  test("50/50 → 100%", () => {
    const ctx = computeSampleContext(50, 50);
    expect(ctx.sampleCoveragePercent).toBe(100);
    expect(ctx.isSampleDerived).toBe(false);
  });

  test("100/150 → ~66.67%", () => {
    const ctx = computeSampleContext(100, 150);
    expect(ctx.sampleCoveragePercent).toBeCloseTo(66.67, 1);
    expect(ctx.isSampleDerived).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && bun test src/__tests__/sample-context.test.ts
```

Expected: FAIL — `computeSampleContext` doesn't exist yet.

- [ ] **Step 3: Implement `computeSampleContext()` in metrics.ts**

At the top of `src/lib/metrics.ts`, add import (after line 1):

```typescript
import type { AgentMetrics, AgentTransactionData, SampleContext } from "./types";
```

(Replace existing `import type { AgentMetrics, AgentTransactionData } from "./types";`)

After the closing brace of `computeMetrics` (after line 124), add:

```typescript
export function computeSampleContext(
  sampleSize: number,
  totalTransactionCount: number,
): SampleContext {
  const effectiveTotal = Math.max(totalTransactionCount, sampleSize);
  return {
    totalTransactionCount: effectiveTotal,
    sampleSize,
    sampleCoveragePercent: effectiveTotal > 0
      ? Number(((sampleSize / effectiveTotal) * 100).toFixed(2))
      : 100,
    isSampleDerived: sampleSize < effectiveTotal,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && bun test src/__tests__/sample-context.test.ts
```

Expected: All 5 PASS.

- [ ] **Step 5: Thread sampleContext into `computeMetrics()` return**

In `computeMetrics()` (metrics.ts), change line 5 from:

```typescript
  const { address, transactions } = data;
```

to:

```typescript
  const { address, transactions, addressInfo } = data;
```

After line 27 (`const txFrequencyPerDay = ...`), add:

```typescript
  const totalTxCount = addressInfo?.transactionsCount ?? transactions.length;
  const sampleContext = computeSampleContext(transactions.length, totalTxCount);
```

In the return object (line 105-123), add after `consistencyScore`:

```typescript
    sampleContext,
    earliestSampleTimestamp: firstSeen,
```

- [ ] **Step 6: Run typecheck**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor
git add src/__tests__/sample-context.test.ts src/lib/metrics.ts
git commit -m "feat: add computeSampleContext and thread into computeMetrics

New pure function computes sample coverage from fetched tx count vs
Blockscout total. Now reads addressInfo.transactionsCount (was fetched
but never used). 5 tests covering edge cases."
```

---

## Task 3: Thread Sample Context into Behavioral Profile + Route

**Files:**
- Modify: `src/lib/behavioral-profile.ts:49-77`
- Modify: `src/app/api/analyze/route.ts:162-166, 234-246`

- [ ] **Step 1: Add 7th param to `computeBehavioralProfile()`**

In `src/lib/behavioral-profile.ts`, change the function signature (lines 49-56) from:

```typescript
export async function computeBehavioralProfile(
  address: string,
  chainId: ChainId,
  transactions: readonly TransactionSummary[],
  tokenTransfers: readonly TokenTransfer[],
  _contractCalls: readonly ContractCall[],
  coinBalanceHistory: readonly CoinBalancePoint[],
): Promise<BehavioralProfile> {
```

to:

```typescript
export async function computeBehavioralProfile(
  address: string,
  chainId: ChainId,
  transactions: readonly TransactionSummary[],
  tokenTransfers: readonly TokenTransfer[],
  _contractCalls: readonly ContractCall[],
  coinBalanceHistory: readonly CoinBalancePoint[],
  totalTransactionCount?: number,
): Promise<BehavioralProfile> {
```

- [ ] **Step 2: Add imports and compute sampleContext in behavioral-profile.ts**

Add to imports at top of `src/lib/behavioral-profile.ts` (line 1):

```typescript
import type {
  TransactionSummary, TokenTransfer, ContractCall, CoinBalancePoint,
  BehavioralProfile, LifeEvent, ActivityCategory, ResolvedCounterparty,
  FailedTxAnalysis, TimezoneFingerprint, TokenFlowSummary, BalanceStory,
  ChainId, SampleContext,
} from "./types";
```

(Add `SampleContext` to existing import.)

After line 8 (`import { resolveProtocolName } from "./protocol-registry";`), add:

```typescript
import { computeSampleContext } from "./metrics";
```

- [ ] **Step 3: Add sampleContext + sampleWindowDays to return object**

In the return object (line 61-77), after `longestDormancy: computeLongestDormancy(sortedTxs),` (line 76), add:

```typescript
    sampleContext: computeSampleContext(validTxs.length, totalTransactionCount ?? validTxs.length),
    sampleWindowDays: sortedTxs.length >= 2
      ? Math.round((sortedTxs[sortedTxs.length - 1].timestamp - sortedTxs[0].timestamp) / 86_400_000)
      : 0,
```

Note: `sampleWindowDays` is the same value as `walletAgeDays` — it's an alias with an honest name for when we know it's sample-derived.

- [ ] **Step 4: Update route.ts — thread totalTransactionCount (single + multi-chain)**

In the multi-chain merge block (lines 147-154), after `coinBalanceHistory: mergedCoinBalance,` (line 152), the merged `agentData` uses `primary.computedMetrics` which only has single-chain sample context. We need to compute the correct multi-chain total.

After the `agentData = { ...primary, ... }` block (line 154), add:

```typescript
      // Compute multi-chain total transaction count for sample context
      const multiChainTotalTxCount = allChainData.reduce(
        (sum, d) => sum + (d.addressInfo?.transactionsCount ?? d.transactions.length),
        0,
      );
```

Then in step 4c (below), `multiChainTotalTxCount` is passed as the 7th arg to `computeBehavioralProfile` when in multi-chain mode. The behavioral profile call must be updated to handle both paths:

After the existing `computeBehavioralProfile` call (lines 162-166), wrap it so multi-chain uses the summed total:

```typescript
    const totalTxCount = (selectedChain === "all" && chainResults.length > 1)
      ? multiChainTotalTxCount
      : agentData.addressInfo?.transactionsCount;
```

Then the single call becomes:

```typescript
    const behavioralProfile = await computeBehavioralProfile(
      agentData.address, agentData.chainId,
      agentData.transactions, agentData.tokenTransfers,
      agentData.contractCalls, agentData.coinBalanceHistory ?? [],
      totalTxCount,
    );
```

This replaces the change in step 4 (single-chain only) — both paths now use the same call with the correct total.

- [ ] **Step 4c: Rename field + add sampleContext to response**

Change line 238 from:

```typescript
      totalTransactionCount: enrichedData.transactions.length,
```

to:

```typescript
      fetchedTransactionCount: enrichedData.transactions.length,
```

After `ensName` (line 244), add:

```typescript
      sampleContext: enrichedData.computedMetrics?.sampleContext,
```

- [ ] **Step 5: Update dashboard/page.tsx — rename + add entity/sample display**

In `src/app/dashboard/page.tsx`, replace all 3 occurrences of `totalTransactionCount` (lines 155, 275, 538) with `fetchedTransactionCount`.

Additionally, where the transaction count is displayed to the user (near line 275), add sample context display when available:

```typescript
{result.sampleContext?.isSampleDerived && (
  <span className="text-xs text-muted-foreground ml-1">
    (sample of {result.sampleContext.totalTransactionCount.toLocaleString()} total — {result.sampleContext.sampleCoveragePercent}% coverage)
  </span>
)}
```

Where the report title/heading is displayed, add entity type awareness:

```typescript
{result.entityType && result.entityType !== "AUTONOMOUS_AGENT" && (
  <div className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
    {result.entityType === "PROTOCOL_CONTRACT" && "⚙️ This is a protocol contract, not an autonomous agent."}
    {result.entityType === "USER_WALLET" && "👤 This appears to be a human wallet, not an autonomous agent."}
    {result.entityType === "UNKNOWN" && "❓ Entity type could not be determined."}
  </div>
)}
```

**Note:** Exact placement depends on current dashboard layout. The implementer should read the dashboard component and place these UI elements where they make contextual sense — near the existing transaction count display and report header respectively. The JSX above is the content; the wrapper/positioning follows existing patterns.

- [ ] **Step 6: Run typecheck**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

Expected: PASS. The `AnalyzeResponse` field was renamed in Task 1, and all consumers now match.

- [ ] **Step 7: Commit**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor
git add src/lib/behavioral-profile.ts src/app/api/analyze/route.ts src/app/dashboard/page.tsx
git commit -m "feat: thread sample context through behavioral profile and route

Pass addressInfo.transactionsCount as 7th arg to computeBehavioralProfile.
Add sampleContext + sampleWindowDays to behavioral profile return.
Rename AnalyzeResponse.totalTransactionCount → fetchedTransactionCount.
Update dashboard references. Add sampleContext to API response."
```

---

## Task 4: Write Entity Classifier Tests + Implementation

**Files:**
- Create: `src/__tests__/entity-classifier.test.ts`
- Create: `src/lib/entity-classifier.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/__tests__/entity-classifier.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { computeFromRatio, classifyEntityType } from "../lib/entity-classifier";
import type { TransactionSummary, AddressInfo, SmartContractData, WalletClassification } from "../lib/types";

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeTx(overrides: Partial<TransactionSummary> = {}): TransactionSummary {
  return {
    hash: "0xabc",
    from: "0xSELF",
    to: "0xOTHER",
    value: "0",
    gasUsed: "21000",
    gasLimit: "21000",
    methodId: "0xa9059cbb",
    timestamp: 1700000000,
    success: true,
    nonce: 0,
    ...overrides,
  };
}

function makeTxs(count: number, from: string, to: string): readonly TransactionSummary[] {
  return Array.from({ length: count }, (_, i) =>
    makeTx({ from, to, nonce: i, timestamp: 1700000000 + i * 60, hash: `0x${i}` }),
  );
}

const CONTRACT_ADDRESS_INFO: AddressInfo = {
  isContract: true,
  addressType: "contract",
  implementationAddress: null,
  ensName: null,
  transactionsCount: 100,
};

const EOA_ADDRESS_INFO: AddressInfo = {
  isContract: false,
  addressType: "EOA",
  implementationAddress: null,
  ensName: null,
  transactionsCount: 100,
};

const HIGH_HUMAN_WALLET: WalletClassification = {
  isDefinitelyContract: false,
  isERC4337: false,
  humanScore: 85,
  signals: ["diverse counterparties"],
  tier1Decisive: false,
  confidence: "HIGH",
};

const LOW_HUMAN_WALLET: WalletClassification = {
  isDefinitelyContract: false,
  isERC4337: false,
  humanScore: 15,
  signals: ["automated patterns"],
  tier1Decisive: false,
  confidence: "HIGH",
};

// ─── computeFromRatio ──────────────────────────────────────────────────────

describe("computeFromRatio", () => {
  test("empty txs → 0", () => {
    expect(computeFromRatio("0xSELF", [])).toBe(0);
  });

  test("all from self → 1.0", () => {
    const txs = makeTxs(10, "0xSELF", "0xOTHER");
    expect(computeFromRatio("0xSELF", txs)).toBe(1.0);
  });

  test("all to self (none from) → 0.0", () => {
    const txs = makeTxs(10, "0xOTHER", "0xSELF");
    expect(computeFromRatio("0xSELF", txs)).toBe(0.0);
  });

  test("mixed 50/50 → 0.5", () => {
    const txs = [
      ...makeTxs(5, "0xSELF", "0xOTHER"),
      ...makeTxs(5, "0xOTHER", "0xSELF"),
    ];
    expect(computeFromRatio("0xSELF", txs)).toBe(0.5);
  });

  test("case insensitive address matching", () => {
    const txs = makeTxs(10, "0xself", "0xOTHER");
    expect(computeFromRatio("0xSELF", txs)).toBe(1.0);
  });
});

// ─── classifyEntityType ────────────────────────────────────────────────────

describe("classifyEntityType", () => {
  test("protocol registry match → PROTOCOL_CONTRACT/DEFINITIVE", () => {
    // 1inch V5 Router is in PROTOCOL_ADDRESSES
    const result = classifyEntityType({
      address: "0x1111111254eeb25477b68fb85ed929f73a960582",
      transactions: makeTxs(10, "0xOTHER", "0x1111111254eeb25477b68fb85ed929f73a960582"),
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("PROTOCOL_CONTRACT");
    expect(result.confidence).toBe("DEFINITIVE");
    expect(result.primarySignal).toContain("protocol registry");
  });

  test("contract name pattern → PROTOCOL_CONTRACT/DEFINITIVE", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(10, "0xOTHER", "0xABC"),
      addressInfo: CONTRACT_ADDRESS_INFO,
      smartContractData: { isVerified: true, name: "UniswapV3Router", abi: null, sourceCode: null } as SmartContractData,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("PROTOCOL_CONTRACT");
    expect(result.confidence).toBe("DEFINITIVE");
    expect(result.primarySignal).toContain("contract name");
  });

  test("contract + low from ratio → PROTOCOL_CONTRACT/HIGH", () => {
    // Contract that is rarely tx.from (others call it)
    const txs = [
      ...makeTxs(1, "0xABC", "0xOTHER"),   // 1 from self
      ...makeTxs(19, "0xOTHER", "0xABC"),   // 19 to self
    ];
    const result = classifyEntityType({
      address: "0xABC",
      transactions: txs,
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("PROTOCOL_CONTRACT");
    expect(result.confidence).toBe("HIGH");
  });

  test("ERC-8004 registered → AUTONOMOUS_AGENT/DEFINITIVE", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(10, "0xABC", "0xOTHER"),
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: true,
    });
    expect(result.entityType).toBe("AUTONOMOUS_AGENT");
    expect(result.confidence).toBe("DEFINITIVE");
  });

  test("contract + high from ratio → AUTONOMOUS_AGENT/HIGH", () => {
    // Contract that initiates most txs (agent behavior)
    const txs = [
      ...makeTxs(18, "0xABC", "0xOTHER"),
      ...makeTxs(2, "0xOTHER", "0xABC"),
    ];
    const result = classifyEntityType({
      address: "0xABC",
      transactions: txs,
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("AUTONOMOUS_AGENT");
    expect(result.confidence).toBe("HIGH");
  });

  test("EOA + high humanScore → USER_WALLET/MEDIUM", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(20, "0xABC", "0xOTHER"),
      addressInfo: EOA_ADDRESS_INFO,
      walletClassification: HIGH_HUMAN_WALLET,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("USER_WALLET");
    expect(result.confidence).toBe("MEDIUM");
  });

  test("EOA + low humanScore → AUTONOMOUS_AGENT/MEDIUM", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(20, "0xABC", "0xOTHER"),
      addressInfo: EOA_ADDRESS_INFO,
      walletClassification: LOW_HUMAN_WALLET,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("AUTONOMOUS_AGENT");
    expect(result.confidence).toBe("MEDIUM");
  });

  test("ambiguous → UNKNOWN/LOW", () => {
    const midWallet: WalletClassification = { ...HIGH_HUMAN_WALLET, humanScore: 50 };
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(20, "0xABC", "0xOTHER"),
      addressInfo: EOA_ADDRESS_INFO,
      walletClassification: midWallet,
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("UNKNOWN");
    expect(result.confidence).toBe("LOW");
  });

  test("< 10 txs → skips from-ratio heuristics", () => {
    // Contract with 0% from ratio but only 5 txs — should NOT trigger PROTOCOL_CONTRACT/HIGH
    const txs = makeTxs(5, "0xOTHER", "0xABC");
    const result = classifyEntityType({
      address: "0xABC",
      transactions: txs,
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: false,
    });
    // Without enough txs for ratio heuristics and no registry/name match, falls to UNKNOWN
    expect(result.entityType).toBe("UNKNOWN");
  });

  test("waterfall priority: registry wins over ERC-8004", () => {
    const result = classifyEntityType({
      address: "0x1111111254eeb25477b68fb85ed929f73a960582",
      transactions: makeTxs(10, "0xOTHER", "0x1111111254eeb25477b68fb85ed929f73a960582"),
      addressInfo: CONTRACT_ADDRESS_INFO,
      isERC8004Registered: true, // also registered
    });
    // Protocol registry (step 1) beats ERC-8004 (step 4)
    expect(result.entityType).toBe("PROTOCOL_CONTRACT");
    expect(result.confidence).toBe("DEFINITIVE");
  });

  test("undefined walletClassification → skips humanScore, falls to UNKNOWN", () => {
    const result = classifyEntityType({
      address: "0xABC",
      transactions: makeTxs(20, "0xABC", "0xOTHER"),
      addressInfo: EOA_ADDRESS_INFO,
      // walletClassification omitted
      isERC8004Registered: false,
    });
    expect(result.entityType).toBe("UNKNOWN");
    expect(result.confidence).toBe("LOW");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && bun test src/__tests__/entity-classifier.test.ts
```

Expected: FAIL — module `entity-classifier.ts` doesn't exist.

- [ ] **Step 3: Implement `entity-classifier.ts`**

Create `src/lib/entity-classifier.ts`:

```typescript
import type { EntityType, EntityClassification, TransactionSummary, AddressInfo, SmartContractData, WalletClassification } from "./types";
import { resolveProtocolName } from "./protocol-registry";

// ─── Input Interface ────────────────────────────────────────────────────────

export interface EntityClassifierInput {
  readonly address: string;
  readonly transactions: readonly TransactionSummary[];
  readonly addressInfo?: AddressInfo;
  readonly smartContractData?: SmartContractData;
  readonly walletClassification?: WalletClassification;
  readonly isERC8004Registered: boolean;
}

// ─── From Ratio ─────────────────────────────────────────────────────────────

export function computeFromRatio(
  address: string,
  transactions: readonly TransactionSummary[],
): number {
  if (transactions.length === 0) return 0;
  const selfLower = address.toLowerCase();
  const fromCount = transactions.filter(tx => tx.from.toLowerCase() === selfLower).length;
  return fromCount / transactions.length;
}

// ─── Protocol Name Patterns ─────────────────────────────────────────────────

const PROTOCOL_NAME_PATTERNS = [
  "router", "pool", "vault", "factory", "proxy", "registry",
  "controller", "comptroller", "aggregator", "exchange",
  "bridge", "gateway", "inbox", "spoke",
];

function matchesProtocolPattern(name: string): boolean {
  const lower = name.toLowerCase();
  return PROTOCOL_NAME_PATTERNS.some(pattern => lower.includes(pattern));
}

// ─── Classifier ─────────────────────────────────────────────────────────────

export function classifyEntityType(input: EntityClassifierInput): EntityClassification {
  const { address, transactions, addressInfo, smartContractData, walletClassification, isERC8004Registered } = input;
  const isContract = addressInfo?.isContract ?? false;
  const fromRatio = computeFromRatio(address, transactions);
  const signals: string[] = [];

  // Step 1: Protocol registry match
  const protocolName = resolveProtocolName(address);
  if (protocolName) {
    signals.push(`protocol registry: ${protocolName}`);
    return {
      entityType: "PROTOCOL_CONTRACT",
      confidence: "DEFINITIVE",
      signals,
      fromRatio,
      primarySignal: `protocol registry: ${protocolName}`,
    };
  }

  // Step 2: Contract name matches protocol patterns
  if (smartContractData?.name && matchesProtocolPattern(smartContractData.name)) {
    signals.push(`contract name: ${smartContractData.name}`);
    return {
      entityType: "PROTOCOL_CONTRACT",
      confidence: "DEFINITIVE",
      signals,
      fromRatio,
      primarySignal: `contract name: ${smartContractData.name}`,
    };
  }

  // Step 3: Contract + low from ratio (requires ≥10 txs)
  if (isContract && transactions.length >= 10 && fromRatio < 0.05) {
    signals.push(`contract with low from ratio (${(fromRatio * 100).toFixed(1)}%)`);
    return {
      entityType: "PROTOCOL_CONTRACT",
      confidence: "HIGH",
      signals,
      fromRatio,
      primarySignal: `low from ratio: ${(fromRatio * 100).toFixed(1)}%`,
    };
  }

  // Step 4: ERC-8004 registered
  if (isERC8004Registered) {
    signals.push("ERC-8004 registered");
    return {
      entityType: "AUTONOMOUS_AGENT",
      confidence: "DEFINITIVE",
      signals,
      fromRatio,
      primarySignal: "ERC-8004 registered",
    };
  }

  // Step 5: Contract + high from ratio (requires ≥10 txs)
  if (isContract && transactions.length >= 10 && fromRatio > 0.70) {
    signals.push(`contract with high from ratio (${(fromRatio * 100).toFixed(1)}%)`);
    return {
      entityType: "AUTONOMOUS_AGENT",
      confidence: "HIGH",
      signals,
      fromRatio,
      primarySignal: `high from ratio: ${(fromRatio * 100).toFixed(1)}%`,
    };
  }

  // Steps 6-7: humanScore-based (requires walletClassification)
  if (!isContract && walletClassification) {
    // Step 6: High humanScore → USER_WALLET
    if (walletClassification.humanScore > 70) {
      signals.push(`human score: ${walletClassification.humanScore}/100`);
      return {
        entityType: "USER_WALLET",
        confidence: "MEDIUM",
        signals,
        fromRatio,
        primarySignal: `human score: ${walletClassification.humanScore}/100`,
      };
    }

    // Step 7: Low humanScore → AUTONOMOUS_AGENT
    if (walletClassification.humanScore < 30) {
      signals.push(`low human score: ${walletClassification.humanScore}/100`);
      return {
        entityType: "AUTONOMOUS_AGENT",
        confidence: "MEDIUM",
        signals,
        fromRatio,
        primarySignal: `low human score: ${walletClassification.humanScore}/100`,
      };
    }
  }

  // Step 8: Unknown
  signals.push("no definitive signals");
  return {
    entityType: "UNKNOWN",
    confidence: "LOW",
    signals,
    fromRatio,
    primarySignal: "no definitive signals",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && bun test src/__tests__/entity-classifier.test.ts
```

Expected: All 16 PASS.

- [ ] **Step 5: Run all tests to check nothing broken**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && bun test
```

Expected: All existing tests still pass + 16 new tests pass.

- [ ] **Step 6: Commit**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor
git add src/lib/entity-classifier.ts src/__tests__/entity-classifier.test.ts
git commit -m "feat: add entity classifier with waterfall classification

New entity-classifier.ts with computeFromRatio() and classifyEntityType().
Waterfall: protocol registry → contract name pattern → low from ratio →
ERC-8004 → high from ratio → humanScore → UNKNOWN. 16 tests covering
all paths including edge cases."
```

---

## Task 5: Integrate Entity Classifier into Route

**Files:**
- Modify: `src/app/api/analyze/route.ts:2, 193-246`

- [ ] **Step 1: Add import**

In `src/app/api/analyze/route.ts`, after line 8 (`import { computeBehavioralProfile } ...`), add:

```typescript
import { classifyEntityType } from "@/lib/entity-classifier";
```

- [ ] **Step 2: Call classifyEntityType after ERC-8004 lookup**

After line 193 (end of the ERC-8004 discovery block `} catch { /* reverse lookup failed — non-fatal */ }`), add:

```typescript
    // 4.2. Classify entity type (agent vs protocol contract vs user wallet)
    const entityClassification = classifyEntityType({
      address: agentData.address,
      transactions: agentData.transactions,
      addressInfo: agentData.addressInfo,
      smartContractData: agentData.smartContractData,
      walletClassification: agentData.computedMetrics?.walletClassification,
      isERC8004Registered: effectiveAgentId !== null,
    });
```

- [ ] **Step 3: Add entityType + entityClassification to response**

In the response object (around line 234-246), after `sampleContext` (added in Task 3), add:

```typescript
      entityType: entityClassification.entityType,
      entityClassification,
```

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor
git add src/app/api/analyze/route.ts
git commit -m "feat: integrate entity classifier into analyze route

Call classifyEntityType after ERC-8004 lookup. Entity type and
classification added to API response."
```

---

## Task 6: Venice Prompt — DATA WINDOW + ENTITY CLASSIFICATION Sections

**Files:**
- Modify: `src/lib/venice.ts:1134-1284`

**SACRED CONSTRAINTS:** DO NOT change SYSTEM_PROMPT (lines 85-131), worked examples (lines 133-183), `max_tokens: 4096`, `temperature: 0.7`.

- [ ] **Step 1: Add import for SampleContext and EntityClassification**

At the top of `src/lib/venice.ts`, ensure `EntityClassification`, `SampleContext`, `EntityType` are imported from `./types`. Add them to the existing import statement.

- [ ] **Step 2: Build DATA WINDOW section**

In `analyzeAgent()`, after the `addressInfoSection` (around line 1212), add:

```typescript
  // ─── DATA WINDOW section (only when sample-derived) ───
  const sampleCtx = sanitizedData.computedMetrics?.sampleContext;
  const dataWindowSection = sampleCtx?.isSampleDerived ? (() => {
    const coverage = sampleCtx.sampleCoveragePercent;
    let warning = "";
    if (coverage < 10) {
      warning = "\n⚠ CRITICAL: Sample is <10% of total history. DO NOT infer wallet age, daily frequency, or busiest day from this sample. Use total count for scale. Sample shows recent patterns only.";
    } else if (coverage < 50) {
      warning = "\n⚠ Sample covers <50% of history. Exercise caution with age-based and frequency metrics.";
    }
    return `
=== DATA WINDOW (READ THIS FIRST) ===
Total transactions on-chain (Blockscout): ${sampleCtx.totalTransactionCount}
Sample fetched: ${sampleCtx.sampleSize} (most recent)
Sample coverage: ${coverage}%${warning}
`;
  })() : "";
```

- [ ] **Step 3: Build ENTITY CLASSIFICATION section**

After the DATA WINDOW section, add:

```typescript
  // ─── ENTITY CLASSIFICATION section ───
  const entityClass = sanitizedData.entityClassification;
  const entitySection = entityClass ? (() => {
    const framingByType: Record<string, string> = {
      AUTONOMOUS_AGENT: "Produce a standard agent trust score audit.",
      PROTOCOL_CONTRACT: "Frame as protocol health check. Note this is infrastructure, not an agent. User may have mistakenly submitted this.",
      USER_WALLET: "Frame as wallet security review. Note this appears to be a personal wallet. User may have mistakenly submitted this.",
      UNKNOWN: "Entity type could not be determined. Analyze based on data patterns. Do not assume this is an agent.",
    };
    return `
=== ENTITY CLASSIFICATION ===
Entity type: ${entityClass.entityType}
Classification confidence: ${entityClass.confidence}
From ratio: ${Math.round(entityClass.fromRatio * 100)}%
Primary signal: ${entityClass.primarySignal}
All signals: ${entityClass.signals.join(", ")}
${framingByType[entityClass.entityType] ?? ""}
`;
  })() : "";
```

- [ ] **Step 4: Annotate transaction count (line 1279)**

Change line 1279 from:

```typescript
Transaction count: ${sanitizedData.transactions.length}
```

to:

```typescript
Transaction count (sample): ${sanitizedData.transactions.length}${sampleCtx?.isSampleDerived ? ` of ${sampleCtx.totalTransactionCount} total` : ""}
```

- [ ] **Step 5: Insert new sections BEFORE metrics in user message**

In the user message template (line 1282), change:

```typescript
${metricsSection}${walletSection}${groundTruthSection}${methodFreqSection}${addressInfoSection}${contractSection}${balanceSection}${eventsSection}${profileSections}
```

to:

```typescript
${dataWindowSection}${entitySection}${metricsSection}${walletSection}${groundTruthSection}${methodFreqSection}${addressInfoSection}${contractSection}${balanceSection}${eventsSection}${profileSections}
```

- [ ] **Step 6: Fix AGENT BIOGRAPHY wallet age label**

In the profileSections template (around line 1268), change:

```typescript
Wallet age: ${profile.walletAgeDays} days | Contracts deployed: ${profile.contractsDeployed}
```

to:

```typescript
${sampleCtx?.isSampleDerived && sampleCtx.sampleCoveragePercent < 50
  ? `Sample window: ${profile.sampleWindowDays ?? profile.walletAgeDays} days (NOT wallet age — only covers ${sampleCtx.sampleCoveragePercent}% of transactions)`
  : `Wallet age: ${profile.walletAgeDays} days`} | Contracts deployed: ${profile.contractsDeployed}
```

- [ ] **Step 7: Write Venice prompt integration tests**

Create `src/__tests__/venice-prompt-sections.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";

/**
 * These tests verify the prompt assembly logic for new sections.
 * They test the section-building functions extracted from venice.ts,
 * NOT the full Venice API call.
 */

// ─── DATA WINDOW section builder (mirrors venice.ts logic) ───

function buildDataWindowSection(sampleContext?: {
  isSampleDerived: boolean;
  totalTransactionCount: number;
  sampleSize: number;
  sampleCoveragePercent: number;
}): string {
  if (!sampleContext?.isSampleDerived) return "";
  const coverage = sampleContext.sampleCoveragePercent;
  let warning = "";
  if (coverage < 10) {
    warning = "\n⚠ CRITICAL: Sample is <10% of total history. DO NOT infer wallet age, daily frequency, or busiest day from this sample. Use total count for scale. Sample shows recent patterns only.";
  } else if (coverage < 50) {
    warning = "\n⚠ Sample covers <50% of history. Exercise caution with age-based and frequency metrics.";
  }
  return `\n=== DATA WINDOW (READ THIS FIRST) ===\nTotal transactions on-chain (Blockscout): ${sampleContext.totalTransactionCount}\nSample fetched: ${sampleContext.sampleSize} (most recent)\nSample coverage: ${coverage}%${warning}\n`;
}

// ─── ENTITY CLASSIFICATION section builder (mirrors venice.ts logic) ───

function buildEntitySection(entityClassification?: {
  entityType: string;
  confidence: string;
  fromRatio: number;
  primarySignal: string;
  signals: readonly string[];
}): string {
  if (!entityClassification) return "";
  const framingByType: Record<string, string> = {
    AUTONOMOUS_AGENT: "Produce a standard agent trust score audit.",
    PROTOCOL_CONTRACT: "Frame as protocol health check. Note this is infrastructure, not an agent. User may have mistakenly submitted this.",
    USER_WALLET: "Frame as wallet security review. Note this appears to be a personal wallet. User may have mistakenly submitted this.",
    UNKNOWN: "Entity type could not be determined. Analyze based on data patterns. Do not assume this is an agent.",
  };
  return `\n=== ENTITY CLASSIFICATION ===\nEntity type: ${entityClassification.entityType}\nClassification confidence: ${entityClassification.confidence}\nFrom ratio: ${Math.round(entityClassification.fromRatio * 100)}%\nPrimary signal: ${entityClassification.primarySignal}\nAll signals: ${entityClassification.signals.join(", ")}\n${framingByType[entityClassification.entityType] ?? ""}\n`;
}

describe("Venice prompt — DATA WINDOW section", () => {
  test("isSampleDerived=true → includes DATA WINDOW", () => {
    const section = buildDataWindowSection({
      isSampleDerived: true,
      totalTransactionCount: 9_700_000,
      sampleSize: 100,
      sampleCoveragePercent: 0.001,
    });
    expect(section).toContain("DATA WINDOW");
    expect(section).toContain("9700000");
    expect(section).toContain("100");
  });

  test("isSampleDerived=false → empty string (no DATA WINDOW)", () => {
    const section = buildDataWindowSection({
      isSampleDerived: false,
      totalTransactionCount: 100,
      sampleSize: 100,
      sampleCoveragePercent: 100,
    });
    expect(section).toBe("");
  });

  test("coverage <10% → hard warning present", () => {
    const section = buildDataWindowSection({
      isSampleDerived: true,
      totalTransactionCount: 50000,
      sampleSize: 100,
      sampleCoveragePercent: 0.2,
    });
    expect(section).toContain("CRITICAL");
    expect(section).toContain("DO NOT infer");
  });

  test("coverage 10-50% → soft warning present", () => {
    const section = buildDataWindowSection({
      isSampleDerived: true,
      totalTransactionCount: 300,
      sampleSize: 100,
      sampleCoveragePercent: 33.33,
    });
    expect(section).toContain("Exercise caution");
    expect(section).not.toContain("CRITICAL");
  });
});

describe("Venice prompt — ENTITY CLASSIFICATION section", () => {
  test("PROTOCOL_CONTRACT → includes health check framing", () => {
    const section = buildEntitySection({
      entityType: "PROTOCOL_CONTRACT",
      confidence: "DEFINITIVE",
      fromRatio: 0.02,
      primarySignal: "protocol registry: 1inch V5",
      signals: ["protocol registry: 1inch V5"],
    });
    expect(section).toContain("ENTITY CLASSIFICATION");
    expect(section).toContain("health check");
    expect(section).toContain("not an agent");
  });

  test("UNKNOWN → includes 'could not be determined'", () => {
    const section = buildEntitySection({
      entityType: "UNKNOWN",
      confidence: "LOW",
      fromRatio: 0.5,
      primarySignal: "no definitive signals",
      signals: ["no definitive signals"],
    });
    expect(section).toContain("could not be determined");
  });

  test("undefined entityClassification → empty string", () => {
    const section = buildEntitySection(undefined);
    expect(section).toBe("");
  });
});
```

Note: These tests duplicate the section-building logic rather than importing from venice.ts because venice.ts doesn't export these functions as standalone. If during implementation you extract them as exported helpers, import them instead.

- [ ] **Step 8: Run prompt tests**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && bun test src/__tests__/venice-prompt-sections.test.ts
```

Expected: All 7 PASS.

- [ ] **Step 9: Run typecheck**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor
git add src/lib/venice.ts src/__tests__/venice-prompt-sections.test.ts
git commit -m "feat: add DATA WINDOW and ENTITY CLASSIFICATION to Venice prompt

Conditional sections inserted before metrics in user message.
DATA WINDOW shows total vs sample count with coverage warnings.
ENTITY CLASSIFICATION provides entity type + framing instructions.
Transaction count annotated with total. Wallet age label corrected
to 'Sample window' when coverage <50%. SYSTEM_PROMPT untouched."
```

---

## Task 7: Trust Score Formatting — Entity-Aware Titles + Banners

**Files:**
- Modify: `src/lib/trust-score.ts:2, 110-218, 222-278`

- [ ] **Step 1: Add EntityType import**

In `src/lib/trust-score.ts`, change the import on line 2 from:

```typescript
import type { TrustScore, TrustFlag, UITrustScore, BehavioralProfile } from "./types";
```

to:

```typescript
import type { TrustScore, TrustFlag, UITrustScore, BehavioralProfile, EntityType } from "./types";
```

- [ ] **Step 2: Add entity-aware title to formatForTelegram**

At the top of `formatForTelegram()` (after line 110), add:

```typescript
  const titleByEntity: Record<EntityType, string> = {
    AUTONOMOUS_AGENT: "Agent Trust Score",
    PROTOCOL_CONTRACT: "Protocol Health Check",
    USER_WALLET: "Wallet Analysis",
    UNKNOWN: "Address Analysis",
  };
  const reportTitle = titleByEntity[score.entityType ?? "AUTONOMOUS_AGENT"] ?? "AgentAuditor Intelligence Report";
```

Change line 205 from:

```typescript
  return `${emoji} *AgentAuditor Intelligence Report*
```

to:

```typescript
  return `${emoji} *AgentAuditor ${reportTitle}*
```

- [ ] **Step 3: Add entity banner after identity line**

After the identity parts line (line 208), add:

```typescript
${score.entityType === "PROTOCOL_CONTRACT" ? "\n⚙️ _This is a protocol contract, not an autonomous agent._\n" : ""}${score.entityType === "USER_WALLET" ? "\n👤 _This appears to be a human wallet, not an autonomous agent._\n" : ""}
```

- [ ] **Step 4: Add entity fields to formatForUI return**

In `formatForUI()` (line 237-278), after `behavioralProfile,` (line 277), add:

```typescript
    entityType: score.entityType,
    entityClassification: score.entityClassification,
    sampleContext: opts?.behavioralProfile?.sampleContext,
```

- [ ] **Step 5: Run typecheck**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Run all tests**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && bun test
```

Expected: All pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor
git add src/lib/trust-score.ts
git commit -m "feat: entity-aware trust score formatting

formatForTelegram: title changes per entity type, banner for
PROTOCOL_CONTRACT and USER_WALLET. formatForUI: passes through
entityType, entityClassification, sampleContext."
```

---

## Task 8: Final Verification

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && bun test
```

Expected: All tests pass (existing + 28 new: 5 sample-context + 16 entity-classifier + 7 venice-prompt-sections).

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit
```

Expected: PASS, zero errors.

- [ ] **Step 3: Verify sacred constraints preserved**

Check that SYSTEM_PROMPT, worked examples, max_tokens, and temperature are unchanged:

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor
git diff v2-stable-timeout-fix -- src/lib/venice.ts | head -200
```

Verify: no changes between lines 85-183 (SYSTEM_PROMPT + worked examples). `max_tokens: 4096` and `temperature: 0.7` untouched.

- [ ] **Step 4: Manual smoke test (optional but recommended)**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor && bun run dev
```

Test with:
1. Known protocol: `0x1111111254eeb25477b68fb85ed929f73a960582` (1inch router, Ethereum) → should show "Protocol Health Check" + entity banner
2. Known agent: any Olas keeper on Gnosis → should show "Agent Trust Score"
3. Regular address → should show appropriate type or "Address Analysis"

- [ ] **Step 5: Tag release**

```bash
cd /Users/MAC/hackathon-toolkit/active/agent-auditor
git tag v3-accuracy-fixes
```
