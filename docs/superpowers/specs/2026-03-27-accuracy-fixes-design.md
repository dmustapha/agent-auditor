# AgentAuditor Accuracy Fixes — Design Spec
**Date:** 2026-03-27
**Status:** Draft — rev 2 (spec review fixes applied)
**Git safety:** `v2-stable-timeout-fix` tag at commit `aa40817` (rollback point)

## Overview

Two accuracy fixes for AgentAuditor:
- **Work Item A (Sample Awareness):** Fix factually wrong claims caused by treating ~100 tx sample as complete history
- **Work Item B (Entity Classifier):** Add entity type classification so protocol contracts aren't called "agents"

Ship order: A first (independent, zero-risk), then B (can use A's new `totalTransactionCount`).

## Sacred Constraints (DO NOT VIOLATE)
- DO NOT change SYSTEM_PROMPT (`venice.ts:85-131`)
- DO NOT change worked examples (`venice.ts:133-183`)
- DO NOT change `max_tokens: 4096`
- DO NOT change `temperature: 0.7`
- CAN change: data volume in user message, model, call structure, timeouts

## Decisions Made

| Decision | Choice | Reasoning |
|----------|--------|-----------|
| Ship order | A first, then B | A is independent, zero-risk, improves accuracy for ALL addresses |
| Entity type handling | Soft informational signal, NOT hard gate | Classifier isn't reliable enough on 100-tx sample to block audits |
| EntityType enum | `AUTONOMOUS_AGENT \| PROTOCOL_CONTRACT \| USER_WALLET \| UNKNOWN` | Covers all cases |
| UNKNOWN behavior | Honest uncertainty — Venice told "could not be determined" | More credible than pretending everything is an agent |
| Non-agent framing | Venice prompt + UI title/badge change per entity type | PROTOCOL_CONTRACT="Protocol Health Check", USER_WALLET="Wallet Analysis", AUTONOMOUS_AGENT="Agent Trust Score", UNKNOWN="Address Analysis" |
| User correction | Venice summary AND UI banner for PROTOCOL_CONTRACT and USER_WALLET | Tells users they may have submitted a non-agent |
| Venice opening line | Keep "agent" (don't change to "address") | Safer — Venice is tuned for this word. Entity section overrides framing for non-agents |
| New sections placement | BEFORE metrics in user message | Venice reads limitations before seeing data |

---

## SECTION 1: New Types (`types.ts`)

### 1.1 EntityType and EntityClassification (add after line 41)

```typescript
export type EntityType = "AUTONOMOUS_AGENT" | "PROTOCOL_CONTRACT" | "USER_WALLET" | "UNKNOWN";

export interface EntityClassification {
  readonly entityType: EntityType;
  readonly confidence: "LOW" | "MEDIUM" | "HIGH" | "DEFINITIVE";
  readonly signals: readonly string[];
  readonly fromRatio: number;        // 0.0-1.0: % of txs where address is tx.from
  readonly primarySignal: string;    // the signal that determined classification
}
```

### 1.2 SampleContext (add after EntityClassification)

```typescript
export interface SampleContext {
  readonly totalTransactionCount: number;   // from addressInfo.transactionsCount
  readonly sampleSize: number;              // transactions.length
  readonly sampleCoveragePercent: number;   // (sampleSize / totalTransactionCount) * 100
  readonly isSampleDerived: boolean;        // true when coverage < 100%
}
```

### 1.3 Thread into existing types (all optional fields)

**AgentMetrics (line 131):** Add `sampleContext?: SampleContext` and `earliestSampleTimestamp: number | null`

**BehavioralProfile (line 205):** Add `sampleContext?: SampleContext` and `sampleWindowDays?: number` (optional — added alongside sampleContext in return object)

**AgentTransactionData (line 246):** Add `entityClassification?: EntityClassification` and `sampleContext?: SampleContext`

**TrustScore (line 302):** Add `entityType?: EntityType` and `entityClassification?: EntityClassification`

**AnalyzeResponse (line 425):** Add `entityType?: EntityType`, `entityClassification?: EntityClassification`, `sampleContext?: SampleContext`. **MIGRATION:** Rename existing `totalTransactionCount` field (line 429, currently set to `transactions.length` in route.ts:238) to `fetchedTransactionCount` to avoid collision with `sampleContext.totalTransactionCount` (which holds the real Blockscout total). Update `dashboard/page.tsx` references accordingly.

**UITrustScore (line 449):** Add `entityType?: EntityType`, `entityClassification?: EntityClassification`, `sampleContext?: SampleContext`

**AuditRecord (line 502):** Add `entityType?: EntityType`

---

## SECTION 2: Computation Layer — Sample Context

### 2.1 `computeSampleContext()` — new function in `metrics.ts`

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

### 2.2 Changes to `computeMetrics()` (metrics.ts)

No signature change. Already receives `addressInfo` via the Pick type.

1. Destructure `addressInfo` from data (line 5)
2. Compute: `const totalTxCount = addressInfo?.transactionsCount ?? transactions.length;`
3. Compute: `const sampleContext = computeSampleContext(transactions.length, totalTxCount);`
4. Add `sampleContext` and `earliestSampleTimestamp: firstSeen` to return object

### 2.3 Changes to `computeBehavioralProfile()` (behavioral-profile.ts)

Add `totalTransactionCount?: number` parameter (7th param, optional — doesn't break existing callers).

1. Compute `sampleContext` using `computeSampleContext(validTxs.length, totalTransactionCount ?? validTxs.length)`
2. Add `sampleWindowDays: walletAgeDays` to return object (same computed value, honest name — `walletAgeDays` is computed at line 70-71 as `(lastTx.timestamp - firstTx.timestamp) / 86_400_000`)
3. Add `sampleContext` to return object

**IMPORTANT:** The route.ts change in Section 2.4 (passing 7th arg) MUST be done in the same commit as this signature change. TypeScript won't error on a missing optional param — if route.ts isn't updated, `totalTransactionCount` silently defaults to `undefined` and `sampleContext` falls back to treating the sample as complete.

### 2.4 Changes to `route.ts`

Pass `agentData.addressInfo?.transactionsCount` as 7th arg to `computeBehavioralProfile()`.

For multi-chain: `totalTxCount = chainResults.reduce((sum, cr) => sum + cr.txCount, 0)`.

Add `sampleContext` to response object.

---

## SECTION 3: Entity Classifier — New File

### 3.1 `entity-classifier.ts` (~120 lines)

```typescript
import type { EntityType, EntityClassification, TransactionSummary, AddressInfo, SmartContractData, WalletClassification } from "./types";
import { resolveProtocolName } from "./protocol-registry";

export interface EntityClassifierInput {
  readonly address: string;
  readonly transactions: readonly TransactionSummary[];
  readonly addressInfo?: AddressInfo;
  readonly smartContractData?: SmartContractData;
  readonly walletClassification?: WalletClassification;
  readonly isERC8004Registered: boolean;
}
```

### 3.2 `computeFromRatio()` — pure function

```typescript
export function computeFromRatio(
  address: string,
  transactions: readonly TransactionSummary[],
): number {
  if (transactions.length === 0) return 0;
  const selfLower = address.toLowerCase();
  const fromCount = transactions.filter(tx => tx.from.toLowerCase() === selfLower).length;
  return fromCount / transactions.length;
}
```

Returns 0.0-1.0. Protocol contracts ~0-5%, agents ~70-100%, humans ~50-90%.

### 3.3 `classifyEntityType()` — waterfall

Priority order:
1. Protocol registry match → `PROTOCOL_CONTRACT` (DEFINITIVE)
2. `smartContractData.name` matches protocol patterns → `PROTOCOL_CONTRACT` (DEFINITIVE). **Matching rules:** Case-insensitive substring match against: router, pool, vault, factory, proxy, registry, controller, comptroller, aggregator, exchange, bridge, gateway, inbox, spoke. Guard: skip when `smartContractData?.name` is null/undefined.
3. `isContract && fromRatio < 5% && txs >= 10` → `PROTOCOL_CONTRACT` (HIGH)
4. ERC-8004 registered → `AUTONOMOUS_AGENT` (DEFINITIVE)
5. `isContract && fromRatio > 70% && txs >= 10` → `AUTONOMOUS_AGENT` (HIGH)
6. `!isContract && walletClassification?.humanScore > 70` → `USER_WALLET` (MEDIUM). **Guard:** When `walletClassification` is undefined (metrics computation failed), skip steps 6-7 and fall through to UNKNOWN.
7. `!isContract && walletClassification?.humanScore < 30` → `AUTONOMOUS_AGENT` (MEDIUM)
8. Else → `UNKNOWN` (LOW)

Steps 3 and 5 require `transactions.length >= 10` — below that, from ratio is too noisy.

### 3.4 Called in `route.ts` AFTER ERC-8004 lookup

```typescript
const entityClassification = classifyEntityType({
  address: agentData.address,
  transactions: agentData.transactions,
  addressInfo: agentData.addressInfo,
  smartContractData: agentData.smartContractData,
  walletClassification: agentData.computedMetrics?.walletClassification,
  isERC8004Registered: effectiveAgentId !== null,
});
```

---

## SECTION 4: Venice Prompt Changes

### CRITICAL: What stays EXACTLY the same
- SYSTEM_PROMPT (lines 85-131)
- Worked examples (lines 133-183)
- max_tokens, temperature
- ALL existing sections: COMPUTED METRICS, WALLET CLASSIFICATION, GROUND TRUTH, CONTRACT DATA, BALANCE TREND, RECENT EVENTS, ADDRESS INFO, METHOD FREQUENCY, all behavioral profile sections
- The JSON start instruction (line 1284)
- analyzeAgent() function signature
- Model selection, Venice parameters, timeout

### 4.1 Opening line (line 1275) — KEEP AS-IS

```
"Analyze this ${chainId} chain agent:"
```

Decision: Keep "agent" — Venice is tuned for this word. The ENTITY CLASSIFICATION section handles framing for non-agents.

### 4.2 Transaction count (line 1279)

```
BEFORE: "Transaction count: ${transactions.length}"
AFTER:  "Transaction count (sample): ${transactions.length}${sampleContext?.isSampleDerived ? ` of ${sampleContext.totalTransactionCount} total` : ''}"
```

### 4.3 DATA WINDOW section (new, conditional)

Only appears when `sampleContext.isSampleDerived === true`. Inserted BEFORE metrics section.

```
=== DATA WINDOW (READ THIS FIRST) ===
Total transactions on-chain (Blockscout): ${totalTransactionCount}
Sample fetched: ${sampleSize} (most recent)
Sample coverage: ${coveragePercent}%
[warning tier based on coverage: <10% hard warning, 10-50% soft warning, >=50% no warning]
```

~60 tokens when present. Zero tokens when sample = total.

### 4.4 ENTITY CLASSIFICATION section (new, conditional)

Only appears when `entityClassification` exists.

```
=== ENTITY CLASSIFICATION ===
Entity type: ${entityType}
Classification confidence: ${confidence}
From ratio: ${Math.round(fromRatio * 100)}%
Primary signal: ${primarySignal}
All signals: ${signals}
${framingText per entity type}
```

Framing text by type:
- AUTONOMOUS_AGENT: "Produce a standard agent trust score audit."
- PROTOCOL_CONTRACT: "Frame as protocol health check. Note this is infrastructure, not an agent. User may have mistakenly submitted this."
- USER_WALLET: "Frame as wallet security review. Note this appears to be a personal wallet. User may have mistakenly submitted this."
- UNKNOWN: "Entity type could not be determined. Analyze based on data patterns. Do not assume this is an agent."

~80 tokens when present.

### 4.5 AGENT BIOGRAPHY fix (line 1268)

```
BEFORE: "Wallet age: ${profile.walletAgeDays} days"
AFTER:  When coverage < 50%: "Sample window: ${sampleWindowDays} days (NOT wallet age — only covers ${coverage}% of transactions)"
        When coverage >= 50%: "Wallet age: ${walletAgeDays} days" (unchanged)
```

### 4.6 Token budget

Last session saved ~1,530 tokens (events compaction + method trim). New sections add ~140 tokens max. Net: still ~1,390 tokens under previous budget.

---

## SECTION 5: Trust Score Formatting

### 5.1 `formatForTelegram()` (trust-score.ts:110)

Entity-aware title:
```typescript
const titleByEntity = {
  AUTONOMOUS_AGENT: "Agent Trust Score",
  PROTOCOL_CONTRACT: "Protocol Health Check",
  USER_WALLET: "Wallet Analysis",
  UNKNOWN: "Address Analysis",
};
```

Entity banner (after identity line, only for PROTOCOL_CONTRACT and USER_WALLET):
- PROTOCOL_CONTRACT: "This is a protocol contract, not an autonomous agent."
- USER_WALLET: "This appears to be a human wallet, not an autonomous agent."
- No banner for AUTONOMOUS_AGENT or UNKNOWN

### 5.2 `formatForUI()` (trust-score.ts:222)

Add `entityType`, `entityClassification`, `sampleContext` to return object.

No signature changes — reads from TrustScore object.

---

## SECTION 6: Error Handling

| Scenario | Handling |
|----------|---------|
| `addressInfo` is null (timeout) | `totalTransactionCount` falls back to `transactions.length`. Coverage = 100%. No DATA WINDOW section. |
| `transactionsCount` is 0 | `Math.max(totalTransactionCount, sampleSize)` → effectiveTotal = sampleSize → coverage = 100% |
| 0 fetched transactions | `fromRatio` = 0. Registry check still works. Heuristics skipped (require ≥10 txs). Falls to UNKNOWN. |
| Multi-chain merged txs | `totalTxCount = sum(chainResults[].txCount)` |
| ERC-8004 lookup times out | `isERC8004Registered = false`. Classifier uses other signals. |

---

## SECTION 7: Testing

### entity-classifier.test.ts (new, ~150 lines)

`computeFromRatio()` — 5 tests:
1. Empty txs → 0
2. All from self → 1.0
3. All to self → 0.0
4. Mixed 50/50 → 0.5
5. Case insensitivity

`classifyEntityType()` — 10 tests:
1. Protocol registry match → PROTOCOL_CONTRACT/DEFINITIVE
2. Contract name pattern → PROTOCOL_CONTRACT/DEFINITIVE
3. Contract + low from ratio → PROTOCOL_CONTRACT/HIGH
4. ERC-8004 registered → AUTONOMOUS_AGENT/DEFINITIVE
5. Contract + high from ratio → AUTONOMOUS_AGENT/HIGH
6. EOA + high humanScore → USER_WALLET/MEDIUM
7. EOA + low humanScore → AUTONOMOUS_AGENT/MEDIUM
8. Ambiguous → UNKNOWN/LOW
9. < 10 txs → skips from-ratio heuristics
10. Waterfall priority: registry wins over ERC-8004
11. undefined walletClassification → skips humanScore steps, falls to UNKNOWN

### sample-context.test.ts (new, ~60 lines)

5 tests:
1. 100 sample / 9.7M total → coverage ≈ 0.001%
2. 100/100 → coverage = 100%, isSampleDerived=false
3. 100/0 → effective total = 100, coverage = 100%
4. 50/50 → 100%
5. 100/150 → ≈66.67%

### Venice prompt integration (in existing test patterns)

1. sampleDerived=true → prompt contains "DATA WINDOW"
2. sampleDerived=false → no "DATA WINDOW"
3. PROTOCOL_CONTRACT → prompt contains "health check"
4. UNKNOWN → prompt contains "could not be determined"
5. Coverage <10% → hard warning present
6. JSON start instruction preserved

---

## SECTION 8: File Change Summary

| File | Action | ~Lines | What |
|------|--------|--------|------|
| `src/lib/types.ts` | Edit | +35 | EntityType, EntityClassification, SampleContext; optional fields on 7 interfaces |
| `src/lib/metrics.ts` | Edit | +12 | computeSampleContext(), use addressInfo.transactionsCount, sampleContext in return |
| `src/lib/behavioral-profile.ts` | Edit | +8 | totalTransactionCount param, sampleContext + sampleWindowDays in return |
| `src/lib/entity-classifier.ts` | **Create** | ~120 | computeFromRatio(), classifyEntityType(), EntityClassifierInput |
| `src/lib/venice.ts` | Edit | +40 | dataWindowSection, entitySection, tx count annotation, AGENT BIOGRAPHY fix |
| `src/lib/trust-score.ts` | Edit | +15 | Entity-aware title, entity banner, pass-through in formatForUI |
| `src/app/api/analyze/route.ts` | Edit | +10 | Thread totalTxCount, call classifyEntityType, add fields to response |
| `src/__tests__/entity-classifier.test.ts` | **Create** | ~160 | 16 test cases (5 fromRatio + 11 classifier) |
| `src/__tests__/sample-context.test.ts` | **Create** | ~60 | 5 test cases |
| `src/app/dashboard/page.tsx` | Edit | +5 | Rename `totalTransactionCount` → `fetchedTransactionCount` references (lines 155, 275, 538); consume `sampleContext` and `entityType` for display |

**Total: ~460 lines across 10 files (2 new, 8 edited)**
