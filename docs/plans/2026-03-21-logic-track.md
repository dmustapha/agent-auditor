# AgentAuditor Logic Track Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the two core analysis flaws — (1) agent vs human wallet detection is 100% LLM guesswork with no local backing, and (2) multiple metrics are hardcoded/fabricated, dead code is never called, and the Venice prompt is under-informed.

**Architecture:** Bottom-up data enrichment. Extract more from Blockscout (zero extra API cost), compute real metrics locally, wire dead code, then feed ground truth to Venice so the LLM augments rather than fabricates. Each task produces a testable, independently verifiable improvement.

**Tech Stack:** TypeScript, Next.js 16, Blockscout REST API, Venice AI (llama-3.3-70b via OpenAI-compat)

---

## File Structure

| File | Responsibility | Action |
|------|---------------|--------|
| `src/lib/types.ts` | All type definitions | Modify: add `AddressInfo`, expand `BlockscoutTransaction`, expand `AgentMetrics`, expand `AgentTransactionData` |
| `src/lib/blockscout.ts` | Blockscout API calls | Modify: extract address info from `/addresses/{address}`, map `result` field from transactions |
| `src/lib/agent-classifier.ts` | Classification + protocol detection | Modify: expand METHOD_REGISTRY, add ERC-4337 V0.7, add `computeWalletClassification()` |
| `src/lib/metrics.ts` | Metric computation | Modify: real `successRate`, `netFlowETH`, behavioral heuristics, wire `inferProtocols()` |
| `src/lib/venice.ts` | Venice AI integration | Modify: system prompt (add agent types, rubrics), user prompt (pre-computed summaries, ground truth) |
| `src/app/api/analyze/route.ts` | Pipeline orchestration | Modify: pass address info through pipeline |

---

### Task 1: Extract Address Info from Blockscout

**Why:** `detectChainWithActivity()` already calls `/addresses/{address}` but only reads `transactions_count`, discarding `is_contract`, `type`, `implementation_address`, `ens_domain_name`. This is the single most definitive signal for contract vs EOA — zero extra API cost.

**Files:**
- Modify: `src/lib/types.ts:1-18` (add `AddressInfo` interface)
- Modify: `src/lib/types.ts:152-162` (add `addressInfo` to `AgentTransactionData`)
- Modify: `src/lib/blockscout.ts:207-231` (extract full address info from existing call)
- Modify: `src/lib/blockscout.ts:173-200` (add `getAddressInfo()`, call in `fetchAgentData`)

- [ ] **Step 1: Add `AddressInfo` type**

In `src/lib/types.ts`, after the `ChainConfig` interface (line 17), add:

```typescript
export interface AddressInfo {
  readonly isContract: boolean;
  readonly addressType: "EOA" | "contract" | "token" | "proxy";
  readonly implementationAddress: string | null;
  readonly ensName: string | null;
  readonly transactionsCount: number;
}
```

- [ ] **Step 2: Add `addressInfo` to `AgentTransactionData`**

In `src/lib/types.ts`, add to the `AgentTransactionData` interface (after line 161):

```typescript
  readonly addressInfo?: AddressInfo;
```

- [ ] **Step 3: Add `getAddressInfo()` to blockscout.ts**

Add a new exported function before `fetchAgentData`:

```typescript
export async function getAddressInfo(
  chainId: ChainId,
  address: string,
): Promise<AddressInfo> {
  const config = getChainConfig(chainId);
  const url = `${config.blockscoutUrl}/addresses/${address}`;
  const res = await rateLimitedFetch(chainId, url);
  const data = await res.json() as Record<string, unknown>;

  return {
    isContract: data.is_contract === true,
    addressType: data.is_contract ? (data.token ? "token" : data.implementation_address ? "proxy" : "contract") : "EOA",
    implementationAddress: (data.implementation_address as string) ?? null,
    ensName: (data.ens_domain_name as string) ?? null,
    transactionsCount: parseInt(String(data.transactions_count ?? "0"), 10),
  };
}
```

- [ ] **Step 4: Wire `getAddressInfo` into `fetchAgentData`**

In `fetchAgentData`, add `getAddressInfo` to the `Promise.all` array and include `addressInfo` in the returned object:

```typescript
const [transactions, tokenTransfers, contractCalls, smartContractData, coinBalanceHistory, eventLogs, addressInfo] =
  await Promise.all([
    getTransactions(chainId, address),
    getTokenTransfers(chainId, address),
    getInternalTransactions(chainId, address),
    getSmartContractData(chainId, address),
    getCoinBalanceHistory(chainId, address),
    getEventLogs(chainId, address),
    getAddressInfo(chainId, address),
  ]);
```

And in the return:
```typescript
  return {
    address,
    chainId,
    transactions,
    tokenTransfers,
    contractCalls,
    computedMetrics,
    smartContractData: smartContractData ?? undefined,
    coinBalanceHistory,
    eventLogs,
    addressInfo,
  };
```

- [ ] **Step 5: Verify build compiles**

Run: `cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/blockscout.ts
git commit -m "feat: extract address info (is_contract, ENS) from Blockscout"
```

---

### Task 2: Map Transaction Success/Failure from Blockscout

**Why:** `successRate` is hardcoded to `1.0` in `metrics.ts:62`. Blockscout transaction responses include a `result` field (e.g. `"success"`, `"error"`) that we already fetch but never map into `TransactionSummary`.

**Files:**
- Modify: `src/lib/types.ts:28-39` (add `result` to `BlockscoutTransaction`)
- Modify: `src/lib/types.ts:83-93` (add `success` to `TransactionSummary`)
- Modify: `src/lib/blockscout.ts:59-69` (map `result` field)
- Modify: `src/lib/metrics.ts:59-62` (compute real success rate)

- [ ] **Step 1: Add `result` to `BlockscoutTransaction`**

In `src/lib/types.ts`, add to `BlockscoutTransaction` (after line 38):

```typescript
  readonly result?: string;
  readonly status?: string;
```

- [ ] **Step 2: Add `success` to `TransactionSummary`**

In `src/lib/types.ts`, add to `TransactionSummary` (after line 92):

```typescript
  readonly success: boolean;
```

- [ ] **Step 3: Map `result` in `getTransactions`**

In `src/lib/blockscout.ts`, update the mapper (line 59-69) to include:

```typescript
success: tx.result === "success" || tx.status === "ok",
```

Add this field to the mapped object alongside `methodId`.

- [ ] **Step 4: Compute real `successRate`**

In `src/lib/metrics.ts`, replace the hardcoded block (lines 59-62) with:

```typescript
  // Real success rate from Blockscout result field
  const successCount = transactions.filter(tx => tx.success).length;
  const successRate = transactions.length > 0 ? successCount / transactions.length : 1.0;
```

- [ ] **Step 5: Verify build compiles**

Run: `cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/blockscout.ts src/lib/metrics.ts
git commit -m "feat: compute real successRate from Blockscout result field"
```

---

### Task 3: Compute Net ETH Flow from Balance History

**Why:** `netFlowETH` in `financialSummary` is entirely fabricated by Venice — it guesses a number. We already fetch `coinBalanceHistory` from Blockscout but only dump the raw JSON into the prompt. Computing it deterministically is trivial.

**Files:**
- Modify: `src/lib/metrics.ts` (add `computeNetFlowETH`)
- Modify: `src/lib/types.ts:111-125` (add `netFlowETH` to `AgentMetrics`)

- [ ] **Step 1: Add `netFlowETH` to `AgentMetrics`**

In `src/lib/types.ts`, add to `AgentMetrics` (after line 124):

```typescript
  readonly netFlowETH: string;
  readonly protocolsUsed: readonly string[];
```

- [ ] **Step 2: Update `computeMetrics` signature to accept balance history**

In `src/lib/metrics.ts`, expand the `Pick` type to include `coinBalanceHistory`:

```typescript
export function computeMetrics(data: Pick<AgentTransactionData, "address" | "chainId" | "transactions" | "tokenTransfers" | "contractCalls" | "coinBalanceHistory">): AgentMetrics {
```

- [ ] **Step 3: Compute `netFlowETH` from balance history**

In `src/lib/metrics.ts`, add before the return statement:

```typescript
  // Net ETH flow: latest balance minus earliest balance
  const balanceHistory = data.coinBalanceHistory ?? [];
  let netFlowETH = "0";
  if (balanceHistory.length >= 2) {
    const sorted = [...balanceHistory].sort((a, b) => a.timestamp - b.timestamp);
    try {
      const earliest = BigInt(sorted[0].value || "0");
      const latest = BigInt(sorted[sorted.length - 1].value || "0");
      const diff = latest - earliest;
      const sign = diff < 0n ? "-" : "";
      const abs = diff < 0n ? -diff : diff;
      netFlowETH = `${sign}${(Number(abs) / 1e18).toFixed(6)}`;
    } catch { /* non-numeric balance value from Blockscout, keep "0" */ }
  }
```

- [ ] **Step 4: Wire `inferProtocols` and add new fields to return**

Import `inferProtocols` (already exported from agent-classifier.ts but never called):

```typescript
import { classifyAgentType, detectERC4337, inferProtocols } from "./agent-classifier";
```

Add to the return object:

```typescript
    netFlowETH,
    protocolsUsed: inferProtocols(transactions),
```

- [ ] **Step 5: Update `fetchAgentData` to pass `coinBalanceHistory` to `computeMetrics`**

In `src/lib/blockscout.ts`, update the `computeMetrics` call (line 187):

```typescript
const computedMetrics = computeMetrics({ address, chainId, transactions, tokenTransfers, contractCalls, coinBalanceHistory });
```

- [ ] **Step 6: Verify build compiles**

Run: `cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/types.ts src/lib/metrics.ts src/lib/blockscout.ts
git commit -m "feat: compute real netFlowETH + wire inferProtocols into pipeline"
```

---

### Task 4: Expand METHOD_REGISTRY and Add ERC-4337 V0.7

**Why:** METHOD_REGISTRY has only 8 entries (~5% DeFi coverage). Missing: Uniswap V3 `exactInputSingle`/`exactInput`, Aave V3 `supply`/`borrow`, Compound V3, WETH `deposit`/`withdraw`, Gnosis Safe `execTransaction`, 1inch `swap`. Also only ERC-4337 V0.6 EntryPoint is checked — V0.7 (`0x0000000071727De22E5E9d8BAf0edAc6f37da032`) is missing.

**Files:**
- Modify: `src/lib/agent-classifier.ts:3-14` (expand registry)
- Modify: `src/lib/agent-classifier.ts:27-31` (add V0.7 EntryPoint)

- [ ] **Step 1: Add ERC-4337 V0.7 EntryPoint constant**

In `src/lib/agent-classifier.ts`, after line 3, add:

```typescript
const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032".toLowerCase();
```

- [ ] **Step 2: Expand METHOD_REGISTRY**

Replace the `METHOD_REGISTRY` object (lines 5-14) with:

```typescript
const METHOD_REGISTRY: Record<string, { type: AgentType; protocol: string }> = {
  // ERC-20
  "0xa9059cbb": { type: "DEX_TRADER", protocol: "ERC20" },
  "0x095ea7b3": { type: "DEX_TRADER", protocol: "ERC20" },
  // Uniswap V2
  "0x7ff36ab5": { type: "DEX_TRADER", protocol: "Uniswap V2" },
  "0x38ed1739": { type: "DEX_TRADER", protocol: "Uniswap V2" },
  "0x18cbafe5": { type: "DEX_TRADER", protocol: "Uniswap V2" },
  // Uniswap V3
  "0x414bf389": { type: "DEX_TRADER", protocol: "Uniswap V3" },
  "0xc04b8d59": { type: "DEX_TRADER", protocol: "Uniswap V3" },
  "0x5ae401dc": { type: "DEX_TRADER", protocol: "Uniswap V3" },
  // Aave V3
  "0x617ba037": { type: "LIQUIDATOR", protocol: "Aave V3" },
  "0xa415bcad": { type: "LIQUIDATOR", protocol: "Aave V3" },
  "0x69328dec": { type: "LIQUIDATOR", protocol: "Aave V3" },
  "0xe8eda9df": { type: "LIQUIDATOR", protocol: "Aave V3" },
  // Compound V3
  "0xf2b9fdb8": { type: "YIELD_OPTIMIZER", protocol: "Compound V3" },
  "0xf3fef3a3": { type: "YIELD_OPTIMIZER", protocol: "Compound V3" },
  // WETH
  "0xd0e30db0": { type: "DEX_TRADER", protocol: "WETH" },
  "0x2e1a7d4d": { type: "DEX_TRADER", protocol: "WETH" },
  // 1inch
  "0x12aa3caf": { type: "DEX_TRADER", protocol: "1inch" },
  "0xe449022e": { type: "DEX_TRADER", protocol: "1inch" },
  // Gnosis Safe
  "0x6a761202": { type: "GOVERNANCE", protocol: "Gnosis Safe" },
  // Chainlink
  "0x4c26a0b6": { type: "ORACLE", protocol: "Chainlink" },
  "0x50d25bcd": { type: "ORACLE", protocol: "Chainlink" },
  // Chainlink Automation / Gelato
  "0x1e83409a": { type: "KEEPER", protocol: "Chainlink Automation" },
  "0x4585e33b": { type: "KEEPER", protocol: "Chainlink Automation" },
  "0x4b64e492": { type: "KEEPER", protocol: "Gelato" },
  // ERC-4337
  "0x1fad948c": { type: "KEEPER", protocol: "ERC-4337 EntryPoint" },
  "0x765e827f": { type: "KEEPER", protocol: "ERC-4337 EntryPoint" },
  // Bridge
  "0x0f5287b0": { type: "BRIDGE_RELAYER", protocol: "Bridge" },
};
```

- [ ] **Step 3: Update `detectERC4337` for V0.7**

Replace the function (lines 27-31) with:

```typescript
export function detectERC4337(txs: readonly TransactionSummary[]): boolean {
  return txs.some(
    tx =>
      tx.to?.toLowerCase() === ENTRY_POINT_V06 ||
      tx.from?.toLowerCase() === ENTRY_POINT_V06 ||
      tx.to?.toLowerCase() === ENTRY_POINT_V07 ||
      tx.from?.toLowerCase() === ENTRY_POINT_V07
  );
}
```

- [ ] **Step 4: Verify build compiles**

Run: `cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent-classifier.ts
git commit -m "feat: expand METHOD_REGISTRY to 28 selectors + ERC-4337 V0.7"
```

---

### Task 5: Add Wallet Classification (Agent vs Human Detection)

**Why:** `isLikelyHumanWallet` is currently 100% Venice's guess with no local heuristic backing. We need a deterministic `WalletClassification` that combines Tier 1 (definitive: `is_contract`, ERC-4337) with Tier 2 (behavioral: method concentration, interval variance, hour entropy, zero-value tx rate) to produce a `humanScore` 0-100 BEFORE Venice. Venice then confirms/overrides with explanation.

**Files:**
- Modify: `src/lib/types.ts` (add `WalletClassification` type)
- Modify: `src/lib/agent-classifier.ts` (add `computeWalletClassification()`)
- Modify: `src/lib/types.ts:111-125` (add `walletClassification` to `AgentMetrics`)
- Modify: `src/lib/metrics.ts` (call `computeWalletClassification`)

- [ ] **Step 1: Add `WalletClassification` type**

In `src/lib/types.ts`, after the `AddressInfo` interface, add:

```typescript
export interface WalletClassification {
  readonly isDefinitelyContract: boolean;
  readonly isERC4337: boolean;
  readonly humanScore: number; // 0 (definitely agent) to 100 (definitely human)
  readonly signals: readonly string[];
  readonly tier1Decisive: boolean; // true if Tier 1 alone was enough
}
```

- [ ] **Step 2: Add `walletClassification` to `AgentMetrics`**

In `src/lib/types.ts`, add to `AgentMetrics` (after `protocolsUsed`):

```typescript
  readonly walletClassification: WalletClassification;
```

- [ ] **Step 3: Implement `computeWalletClassification` in agent-classifier.ts**

Add at the end of `src/lib/agent-classifier.ts` (the import is handled in Step 4):

```typescript
export function computeWalletClassification(
  txs: readonly TransactionSummary[],
  addressInfo?: AddressInfo,
): WalletClassification {
  const signals: string[] = [];
  const isERC4337 = detectERC4337(txs);

  // ── Tier 1: Definitive signals ──
  if (addressInfo?.isContract) {
    signals.push("Address is a smart contract (Blockscout is_contract=true)");
    return {
      isDefinitelyContract: true,
      isERC4337,
      humanScore: isERC4337 ? 30 : 0, // ERC-4337 contracts may be human-operated smart wallets
      signals,
      tier1Decisive: true,
    };
  }

  if (isERC4337) {
    signals.push("ERC-4337 account abstraction detected");
    // Could be human (smart wallet) or agent — Tier 2 decides
  }

  // ── Tier 2: Behavioral heuristics (EOA only) ──
  let humanScore = 50; // neutral start for EOAs

  if (txs.length < 3) {
    signals.push("Too few transactions for behavioral analysis");
    return { isDefinitelyContract: false, isERC4337, humanScore: 50, signals, tier1Decisive: false };
  }

  // 2a. Method concentration: agents repeat the same method ID
  const methodCounts = new Map<string, number>();
  for (const tx of txs) {
    const m = tx.methodId?.slice(0, 10).toLowerCase() ?? "0x";
    methodCounts.set(m, (methodCounts.get(m) ?? 0) + 1);
  }
  const topMethodPct = Math.max(...methodCounts.values()) / txs.length;
  if (topMethodPct > 0.8) {
    humanScore -= 25;
    signals.push(`High method concentration: ${(topMethodPct * 100).toFixed(0)}% same method`);
  } else if (topMethodPct < 0.3) {
    humanScore += 10;
    signals.push("Diverse method usage (human-like)");
  }

  // 2b. Interval variance: agents have regular intervals, humans are erratic
  const timestamps = txs.map(tx => tx.timestamp).sort((a, b) => a - b);
  if (timestamps.length >= 3) {
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0; // coefficient of variation
    if (cv < 0.3) {
      humanScore -= 20;
      signals.push(`Low interval variance (CV=${cv.toFixed(2)}) — bot-like regularity`);
    } else if (cv > 1.5) {
      humanScore += 10;
      signals.push(`High interval variance (CV=${cv.toFixed(2)}) — human-like irregularity`);
    }
  }

  // 2c. Hour entropy: bots run 24/7, humans cluster in waking hours
  const hourCounts = new Array(24).fill(0) as number[];
  for (const ts of timestamps) {
    hourCounts[new Date(ts).getUTCHours()]++;
  }
  const activeHours = hourCounts.filter(c => c > 0).length;
  if (activeHours >= 20) {
    humanScore -= 15;
    signals.push(`Active in ${activeHours}/24 hours — always-on pattern`);
  } else if (activeHours <= 10) {
    humanScore += 10;
    signals.push(`Active in ${activeHours}/24 hours — working-hours pattern`);
  }

  // 2d. Zero-value tx rate: bots often send zero-value calls
  const zeroValueTxs = txs.filter(tx => tx.value === "0" || tx.value === "").length;
  const zeroValueRate = zeroValueTxs / txs.length;
  if (zeroValueRate > 0.7) {
    humanScore -= 10;
    signals.push(`${(zeroValueRate * 100).toFixed(0)}% zero-value transactions — automation signal`);
  }

  // 2e. ENS name: humans more likely to have ENS
  if (addressInfo?.ensName) {
    humanScore += 15;
    signals.push(`ENS name: ${addressInfo.ensName}`);
  }

  // Clamp to 0-100
  humanScore = Math.max(0, Math.min(100, humanScore));

  return {
    isDefinitelyContract: false,
    isERC4337,
    humanScore,
    signals,
    tier1Decisive: false,
  };
}
```

- [ ] **Step 4: Fix import at top of agent-classifier.ts**

The file currently imports only `AgentType` and `TransactionSummary`. Update to:

```typescript
import type { AgentType, TransactionSummary, AddressInfo, WalletClassification } from "./types";
```

- [ ] **Step 5: Wire into `computeMetrics`**

In `src/lib/metrics.ts`:

1. Update imports:
```typescript
import { classifyAgentType, detectERC4337, inferProtocols, computeWalletClassification } from "./agent-classifier";
```

2. Expand the function signature to accept `addressInfo`:
```typescript
export function computeMetrics(data: Pick<AgentTransactionData, "address" | "chainId" | "transactions" | "tokenTransfers" | "contractCalls" | "coinBalanceHistory" | "addressInfo">): AgentMetrics {
```

3. Add before the return statement:
```typescript
  const walletClassification = computeWalletClassification(transactions, data.addressInfo);
```

4. Add to return object:
```typescript
    walletClassification,
```

- [ ] **Step 6: Update `fetchAgentData` to pass `addressInfo` to `computeMetrics`**

In `src/lib/blockscout.ts`, update the `computeMetrics` call:

```typescript
const computedMetrics = computeMetrics({ address, chainId, transactions, tokenTransfers, contractCalls, coinBalanceHistory, addressInfo });
```

- [ ] **Step 7: Verify build compiles**

Run: `cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/agent-classifier.ts src/lib/metrics.ts src/lib/blockscout.ts
git commit -m "feat: add deterministic wallet classification (agent vs human)"
```

---

### Task 6: Improve Venice System Prompt

**Why:** The system prompt is missing GOVERNANCE and YIELD_OPTIMIZER from the agent type list (line 98), has no rubric for `performanceScore` or `consistencyScore`, and doesn't receive ground truth data. Venice guesses values it should be given.

**Files:**
- Modify: `src/lib/venice.ts:68-145` (system prompt)

- [ ] **Step 1: Update agent type list**

In `src/lib/venice.ts`, replace line 98:

```
Classify the agent as one of: KEEPER, ORACLE, LIQUIDATOR, MEV_BOT, BRIDGE_RELAYER, DEX_TRADER, UNKNOWN
```

with:

```
Classify the agent as one of: KEEPER, ORACLE, LIQUIDATOR, MEV_BOT, BRIDGE_RELAYER, DEX_TRADER, GOVERNANCE, YIELD_OPTIMIZER, UNKNOWN
```

- [ ] **Step 2: Add rubrics for performanceScore and consistencyScore**

After the RECOMMENDATION section (line 109), add:

```
PERFORMANCE SCORE (0-100):
- 90-100: Exceptional uptime, zero failures, consistent gas efficiency
- 70-89: Reliable operation with minor gaps
- 40-69: Notable issues — failures, inefficiency, long gaps
- 0-39: Severely degraded — frequent failures, abandoned, or erratic

CONSISTENCY SCORE (0.0-1.0):
- 0.9-1.0: Extremely regular intervals, predictable behavior
- 0.6-0.89: Mostly consistent with occasional variance
- 0.3-0.59: Irregular but not random
- 0.0-0.29: Highly erratic or one-off activity

HUMAN WALLET DETECTION:
You will receive a pre-computed humanScore (0-100) with signals. Use these as GROUND TRUTH.
- If humanScore > 70 and is_contract=false: set isLikelyHumanWallet=true
- If humanScore < 30 or is_contract=true: set isLikelyHumanWallet=false
- If 30-70: use your analysis to decide, explain reasoning in behavioralNarrative

GROUND TRUTH VALUES:
Some values are pre-computed deterministically and provided in the prompt. DO NOT fabricate these:
- successRate: provided — use as-is
- netFlowETH: provided — use as-is
- protocolsUsed: provided — use as-is, you may add protocols you detect from context
- totalGasSpentETH: provided — use as-is
```

- [ ] **Step 3: Verify build compiles**

Run: `cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/venice.ts
git commit -m "feat: improve Venice system prompt with rubrics + ground truth rules"
```

---

### Task 7: Improve Venice User Prompt (Feed Ground Truth)

**Why:** The user prompt sends raw JSON blobs, only the last 20 transactions, a raw 24-element histogram, and no pre-computed summaries. Venice should receive ground truth values so it augments rather than fabricates.

**Files:**
- Modify: `src/lib/venice.ts:256-307` (user prompt construction in `analyzeAgent`)

- [ ] **Step 1: Add wallet classification to metrics section**

In `src/lib/venice.ts`, update the `metricsSection` construction (lines 265-274). After the existing metrics, add:

```typescript
  const walletSection = metrics?.walletClassification ? `
=== WALLET CLASSIFICATION (GROUND TRUTH) ===
Human score: ${metrics.walletClassification.humanScore}/100
Is contract: ${metrics.walletClassification.isDefinitelyContract}
Is ERC-4337: ${metrics.walletClassification.isERC4337}
Tier 1 decisive: ${metrics.walletClassification.tier1Decisive}
Signals:
${metrics.walletClassification.signals.map(s => `  - ${s}`).join("\n")}
` : "";
```

- [ ] **Step 2: Add pre-computed ground truth values**

After the wallet section, add:

```typescript
  const groundTruthSection = metrics ? `
=== GROUND TRUTH VALUES (use these, do not fabricate) ===
Success rate: ${(metrics.successRate * 100).toFixed(1)}%
Net ETH flow: ${metrics.netFlowETH} ETH
Protocols detected: ${metrics.protocolsUsed.length > 0 ? metrics.protocolsUsed.join(", ") : "none detected locally"}
Total gas spent: ${(Number(metrics.totalGasSpentWei) / 1e18).toFixed(6)} ETH
Largest single tx: ${(Number(BigInt(metrics.largestSingleTxWei)) / 1e18).toFixed(6)} ETH
` : "";
```

- [ ] **Step 3: Replace raw balance history with summary**

Replace the `balanceSection` (lines 281-284) with:

```typescript
  const balanceSection = sanitizedData.coinBalanceHistory?.length ? (() => {
    try {
      const sorted = [...sanitizedData.coinBalanceHistory].sort((a, b) => a.timestamp - b.timestamp);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const firstETH = (Number(BigInt(first.value || "0")) / 1e18).toFixed(6);
      const lastETH = (Number(BigInt(last.value || "0")) / 1e18).toFixed(6);
      const dataPoints = sorted.length;
      return `
=== BALANCE TREND ===
Data points: ${dataPoints}
Earliest: ${firstETH} ETH (${new Date(first.timestamp).toISOString()})
Latest: ${lastETH} ETH (${new Date(last.timestamp).toISOString()})
`;
    } catch { return ""; }
  })() : "";
```

- [ ] **Step 4: Add address info section**

```typescript
  const addressInfoSection = sanitizedData.addressInfo ? `
=== ADDRESS INFO ===
Type: ${sanitizedData.addressInfo.addressType}
Is contract: ${sanitizedData.addressInfo.isContract}
ENS: ${sanitizedData.addressInfo.ensName ?? "none"}
Implementation: ${sanitizedData.addressInfo.implementationAddress ?? "N/A"}
` : "";
```

- [ ] **Step 5: Add new sections to user message**

Update the `userMessage` template to include the new sections:

```typescript
${metricsSection}${walletSection}${groundTruthSection}${addressInfoSection}${contractSection}${balanceSection}${eventsSection}
```

- [ ] **Step 6: Verify build compiles**

Run: `cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/venice.ts
git commit -m "feat: feed ground truth values to Venice prompt"
```

---

### Task 8: Wire Ground Truth Through Pipeline Response

**Why:** Venice receives ground truth but the pipeline should also enforce it — if Venice returns a `netFlowETH` that differs from our computed value, we override. The `normalizeVeniceResponse` function should merge local data.

**Files:**
- Modify: `src/lib/venice.ts:153-234` (normalizeVeniceResponse)
- Modify: `src/lib/venice.ts:256-354` (analyzeAgent — pass metrics to normalizer)
- Modify: `src/lib/types.ts` (add `WalletClassification` to `TrustScore` and `UITrustScore`)

- [ ] **Step 1: Add wallet classification to TrustScore type**

In `src/lib/types.ts`, add to `TrustScore` (after `isLikelyHumanWallet` line 222):

```typescript
  readonly walletClassification?: WalletClassification;
```

- [ ] **Step 2: Add wallet classification to UITrustScore type**

In `src/lib/types.ts`, add to `UITrustScore` (after `isLikelyHumanWallet` line 350):

```typescript
  readonly walletClassification?: WalletClassification;
```

- [ ] **Step 3: Update `normalizeVeniceResponse` to accept and merge metrics**

Change the function signature:

```typescript
function normalizeVeniceResponse(
  raw: Record<string, unknown>,
  address: string,
  chainId: ChainId,
  metrics?: AgentMetrics,
): TrustScore {
```

Add the import for `AgentMetrics` at the top of the file.

- [ ] **Step 4: Override fabricated values with ground truth**

In `normalizeVeniceResponse`, before the return statement, merge ground truth:

```typescript
  // Override Venice fabrications with locally computed ground truth
  const computedFinancials = metrics ? {
    totalGasSpentETH: (Number(metrics.totalGasSpentWei) / 1e18).toFixed(6),
    netFlowETH: metrics.netFlowETH,
    largestSingleTxETH: (Number(BigInt(metrics.largestSingleTxWei)) / 1e18).toFixed(6),
  } : undefined;

  const overriddenProtocols = metrics?.protocolsUsed.length
    ? [...new Set([...metrics.protocolsUsed, ...(raw.protocolsUsed as string[] ?? [])])]
    : (raw.protocolsUsed as string[] ?? []);

  const walletClass = metrics?.walletClassification;
  const humanWallet = walletClass
    ? (walletClass.humanScore > 70 && !walletClass.isDefinitelyContract)
    : (typeof raw.isLikelyHumanWallet === "boolean" ? raw.isLikelyHumanWallet : false);
```

Then update the return to use these:

```typescript
    financialSummary: computedFinancials ?? {
      totalGasSpentETH: finSummary?.totalGasSpentETH ?? "0",
      netFlowETH: finSummary?.netFlowETH ?? "0",
      largestSingleTxETH: finSummary?.largestSingleTxETH ?? "0",
    },
    protocolsUsed: overriddenProtocols,
    // ...
    isLikelyHumanWallet: humanWallet,
    walletClassification: walletClass,
```

- [ ] **Step 5: Pass metrics to `normalizeVeniceResponse` in `analyzeAgent`**

In `analyzeAgent`, update the call at line 351:

```typescript
  const normalized = normalizeVeniceResponse(parsed, data.address, data.chainId, data.computedMetrics);
```

- [ ] **Step 6: Add `walletClassification` to `formatForUI`**

In `src/lib/trust-score.ts`, add to the returned object:

```typescript
    walletClassification: score.walletClassification,
```

- [ ] **Step 7: Verify build compiles**

Run: `cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 8: Commit**

```bash
git add src/lib/types.ts src/lib/venice.ts src/lib/trust-score.ts
git commit -m "feat: enforce ground truth overrides in Venice response normalization"
```

---

### Task 9: Update Mock Mode for New Fields

**Why:** `createMockTrustScore` in `venice.ts:358-424` doesn't include the new fields (`walletClassification`, real `netFlowETH`, `protocolsUsed`). Development mode will break without this.

**Files:**
- Modify: `src/lib/venice.ts:358-424` (mock function)

- [ ] **Step 1: Import `WalletClassification` type**

Already imported via types — verify.

- [ ] **Step 2: Update `createMockTrustScore` to include new fields**

Add to the return object:

```typescript
    walletClassification: {
      isDefinitelyContract: false,
      isERC4337: false,
      humanScore: 20,
      signals: ["Mock: assumed bot-like behavior"],
      tier1Decisive: false,
    },
```

- [ ] **Step 3: Verify build compiles**

Run: `cd ~/hackathon-toolkit/active/agent-auditor && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/venice.ts
git commit -m "fix: update mock trust score with new classification fields"
```

---

### Task 10: End-to-End Smoke Test

**Why:** All pieces are wired — verify the full pipeline works with a real address.

**Files:**
- No code changes. Manual verification.

- [ ] **Step 1: Start dev server**

```bash
cd ~/hackathon-toolkit/active/agent-auditor && npm run dev
```

- [ ] **Step 2: Test with a known contract address**

Open browser, enter Uniswap V3 Router: `0xE592427A0AEce92De3Edee1F18E0157C05861564` on Ethereum.

Verify:
- `isLikelyHumanWallet` should be `false` (it's a contract)
- `successRate` should NOT be 100% (some txs fail)
- `netFlowETH` should be a real computed number
- `protocolsUsed` should include "Uniswap V3"
- `walletClassification.isDefinitelyContract` should be `true`

- [ ] **Step 3: Test with a known human wallet**

Enter `vitalik.eth` or `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` on Ethereum.

Verify:
- `isLikelyHumanWallet` should be `true`
- `humanScore` should be high (diverse methods, irregular intervals, ENS)
- `walletClassification.isDefinitelyContract` should be `false`

- [ ] **Step 4: Test with a known bot (jaredfromsubway.eth)**

Enter `0x6b75d8AF000000e20B7a7DDf000Ba900b4009A80` on Ethereum.

Verify:
- `isLikelyHumanWallet` should be `false`
- `humanScore` should be low (high method concentration, regular intervals)

- [ ] **Step 5: Commit all changes**

If any adjustments were needed during testing:

```bash
git add -A
git commit -m "fix: adjustments from end-to-end smoke test"
```
