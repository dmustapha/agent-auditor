import type { AgentType, TransactionSummary, AddressInfo, WalletClassification } from "./types";

const ENTRY_POINT_V06 = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789".toLowerCase();
const ENTRY_POINT_V07 = "0x0000000071727De22E5E9d8BAf0edAc6f37da032".toLowerCase();

/** Normalize a method selector to 0x-prefixed 10-char form (e.g. "0xa9059cbb") */
function normalizeSelector(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const lower = raw.toLowerCase().replace(/^0x/, "");
  if (lower.length < 8 || lower === "00000000") return undefined;
  return `0x${lower.slice(0, 8)}`;
}

export const METHOD_REGISTRY: Record<string, { type?: AgentType; protocol: string }> = {
  // ERC-20 (neutral — does not vote for any agent type)
  "0xa9059cbb": { protocol: "ERC20" },        // transfer
  "0x095ea7b3": { protocol: "ERC20" },        // approve
  "0x23b872dd": { protocol: "ERC20" },        // transferFrom
  // WETH (neutral)
  "0xd0e30db0": { protocol: "WETH" },         // deposit
  "0x2e1a7d4d": { protocol: "WETH" },         // withdraw
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
  // Morpho Blue
  "0xac9650d8": { type: "YIELD_OPTIMIZER", protocol: "Morpho Blue" },  // multicall
  "0xb66503cf": { type: "YIELD_OPTIMIZER", protocol: "Morpho Blue" },  // supply
  "0xa99aad89": { type: "YIELD_OPTIMIZER", protocol: "Morpho Blue" },  // borrow
  "0x20b76e81": { type: "YIELD_OPTIMIZER", protocol: "Morpho Blue" },  // repay
  "0x2644131b": { type: "LIQUIDATOR", protocol: "Morpho Blue" },       // liquidate
  // Pendle
  "0x90d25074": { type: "YIELD_OPTIMIZER", protocol: "Pendle" },       // swapExactTokenForPt
  "0xdcb5e4b6": { type: "YIELD_OPTIMIZER", protocol: "Pendle" },       // addLiquiditySingleToken
  "0x7b1a4f09": { type: "YIELD_OPTIMIZER", protocol: "Pendle" },       // redeemRewards
  // GMX V2
  "0x11d62ed7": { type: "DEX_TRADER", protocol: "GMX V2" },           // createOrder
  "0xf242432a": { type: "DEX_TRADER", protocol: "GMX V2" },           // executeOrder
  "0x0d4d1513": { type: "DEX_TRADER", protocol: "GMX V2" },           // createDeposit
  // EigenLayer
  "0xe7a050aa": { type: "YIELD_OPTIMIZER", protocol: "EigenLayer" },   // depositIntoStrategy
  "0x0dd8dd02": { type: "YIELD_OPTIMIZER", protocol: "EigenLayer" },   // queueWithdrawals
  "0x54b2bf29": { type: "YIELD_OPTIMIZER", protocol: "EigenLayer" },   // completeQueuedWithdrawals
  // Hyperlane
  "0xfa31de01": { type: "BRIDGE_RELAYER", protocol: "Hyperlane" },     // dispatch
  "0x56d5d475": { type: "BRIDGE_RELAYER", protocol: "Hyperlane" },     // process
  // Across
  "0x7b939232": { type: "BRIDGE_RELAYER", protocol: "Across" },        // deposit
  "0xe63d38ed": { type: "BRIDGE_RELAYER", protocol: "Across" },        // fillRelay
  // 1inch
  "0x12aa3caf": { type: "DEX_TRADER", protocol: "1inch" },
  "0xe449022e": { type: "DEX_TRADER", protocol: "1inch" },
  // Gnosis Safe
  "0x6a761202": { type: "GOVERNANCE", protocol: "Gnosis Safe" },
  // Chainlink
  "0x4c26a0b6": { type: "ORACLE", protocol: "Chainlink" },
  "0x50d25bcd": { type: "ORACLE", protocol: "Chainlink" },
  "0xb1dc65a4": { type: "KEEPER", protocol: "Chainlink" }, // transmit (OCR2)
  "0xc9807539": { type: "ORACLE", protocol: "Chainlink" }, // transmit (OCR1)
  // Chainlink Automation / Gelato
  "0x1e83409a": { type: "KEEPER", protocol: "Chainlink Automation" },
  "0x4585e33b": { type: "KEEPER", protocol: "Chainlink Automation" },
  "0x4b64e492": { type: "KEEPER", protocol: "Gelato" },
  // ERC-4337
  "0x1fad948c": { type: "KEEPER", protocol: "ERC-4337 EntryPoint" },
  "0x765e827f": { type: "KEEPER", protocol: "ERC-4337 EntryPoint" },
  // Bridge
  "0x0f5287b0": { type: "BRIDGE_RELAYER", protocol: "Bridge" },
  // CoW Protocol (Gnosis) — settle + setPreSignature
  "0xaa6e8bd0": { type: "DEX_TRADER", protocol: "CoW Protocol" },
  "0xec6cb13f": { type: "DEX_TRADER", protocol: "CoW Protocol" },
  // Balancer
  "0x52bbbe29": { type: "DEX_TRADER", protocol: "Balancer" },
  "0x945bcec9": { type: "DEX_TRADER", protocol: "Balancer" },
  // Curve
  "0x3df02124": { type: "DEX_TRADER", protocol: "Curve" },
  "0xa6417ed6": { type: "DEX_TRADER", protocol: "Curve" },
  // Lido
  "0xa1903eab": { type: "YIELD_OPTIMIZER", protocol: "Lido" },
  "0xf638e5e0": { type: "YIELD_OPTIMIZER", protocol: "Lido" },
  // Omen / Conditional Tokens — buy + redeemPositions
  "0xd6febde8": { type: "GOVERNANCE", protocol: "Omen" },
  "0xcecf2242": { type: "GOVERNANCE", protocol: "Omen" },
  // Olas AgentMech — request(bytes)
  "0xb94207d3": { type: "KEEPER", protocol: "Olas Mech" },
};

export function classifyAgentType(txs: readonly TransactionSummary[]): AgentType {
  const counts: Partial<Record<AgentType, number>> = {};
  for (const tx of txs) {
    const sel = normalizeSelector(tx.methodId);
    const match = sel ? METHOD_REGISTRY[sel] : undefined;
    if (match?.type) counts[match.type] = (counts[match.type] ?? 0) + 1;
  }
  if (Object.keys(counts).length) {
    return (Object.entries(counts) as [AgentType, number][]).sort((a, b) => b[1] - a[1])[0][0];
  }

  // Behavioral inference when no METHOD_REGISTRY matches
  if (txs.length < 3) return "UNKNOWN";

  const zeroValueRate = txs.filter(tx => tx.value === "0" || tx.value === "").length / txs.length;
  const timestamps = txs.map(tx => tx.timestamp).sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  const meanInterval = intervals.length > 0 ? intervals.reduce((s, v) => s + v, 0) / intervals.length : 0;
  const cv = meanInterval > 0
    ? Math.sqrt(intervals.reduce((s, v) => s + (v - meanInterval) ** 2, 0) / intervals.length) / meanInterval
    : 0;

  // High zero-value tx rate + regular intervals → KEEPER
  if (zeroValueRate > 0.7 && cv < 0.5) return "KEEPER";

  // Mostly interacts with a single counterparty (contract) → likely automated trader
  const counterpartyCounts = new Map<string, number>();
  for (const tx of txs) {
    if (tx.to) {
      const key = tx.to.toLowerCase();
      counterpartyCounts.set(key, (counterpartyCounts.get(key) ?? 0) + 1);
    }
  }
  const topCounterpartyRate = counterpartyCounts.size > 0
    ? Math.max(...counterpartyCounts.values()) / txs.length
    : 0;
  // High method concentration + single target = bot trading pattern
  const methodCounts = new Map<string, number>();
  for (const tx of txs) {
    const m = normalizeSelector(tx.methodId) ?? "0x";
    methodCounts.set(m, (methodCounts.get(m) ?? 0) + 1);
  }
  const topMethodRate = methodCounts.size > 0 ? Math.max(...methodCounts.values()) / txs.length : 0;
  if (topMethodRate > 0.6 && topCounterpartyRate > 0.4) return "DEX_TRADER";

  // High failed tx rate → MEV_BOT (frontrunners fail often)
  // Use only txs with known success status as denominator to avoid dilution
  const knownOutcomeTxs = txs.filter(tx => tx.success !== undefined);
  const failedCount = knownOutcomeTxs.filter(tx => !tx.success).length;
  const failedRate = knownOutcomeTxs.length > 5 ? failedCount / knownOutcomeTxs.length : 0;
  if (failedRate > 0.3 && topMethodRate > 0.5) return "MEV_BOT";

  // MEV_BOT: contract + high token tx rate + concentrated counterparty + high volume
  const tokenMethods = new Set(["0xa9059cbb", "0x23b872dd", "0x095ea7b3"]);
  const tokenTxCount = txs.filter(tx => {
    const sel = normalizeSelector(tx.methodId);
    return sel && tokenMethods.has(sel);
  }).length;
  const tokenRate = txs.length > 0 ? tokenTxCount / txs.length : 0;
  if (tokenRate > 0.4 && topCounterpartyRate > 0.5 && topMethodRate > 0.5 && txs.length > 50) return "MEV_BOT";

  // High method concentration + moderate volume → DEX_TRADER
  if (topMethodRate > 0.5 && txs.length > 20) return "DEX_TRADER";

  return "UNKNOWN";
}

export function computeConsistencyScore(txs: readonly TransactionSummary[]): number {
  const timestamps = txs.map(tx => tx.timestamp).filter(ts => ts > 0).sort((a, b) => a - b);
  if (timestamps.length < 3) return 0.5; // insufficient data — neutral

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  if (mean === 0) return 1.0; // all same timestamp — perfectly consistent
  const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(1, 1 - cv / 2));
}

export function detectERC4337(txs: readonly TransactionSummary[]): boolean {
  return txs.some(
    tx =>
      tx.to?.toLowerCase() === ENTRY_POINT_V06 ||
      tx.from?.toLowerCase() === ENTRY_POINT_V06 ||
      tx.to?.toLowerCase() === ENTRY_POINT_V07 ||
      tx.from?.toLowerCase() === ENTRY_POINT_V07
  );
}

export function inferProtocols(txs: readonly TransactionSummary[]): string[] {
  const protocols = new Set<string>();
  for (const tx of txs) {
    const sel = normalizeSelector(tx.methodId);
    const match = sel ? METHOD_REGISTRY[sel] : undefined;
    if (match) protocols.add(match.protocol);
  }
  return Array.from(protocols);
}

export function computeWalletClassification(
  txs: readonly TransactionSummary[],
  addressInfo?: AddressInfo,
): WalletClassification {
  const signals: string[] = [];
  const isERC4337 = detectERC4337(txs);

  // ── Tier 1: Definitive signals (with sanity check) ──
  if (addressInfo?.isContract) {
    // Sanity check: some block explorers mark high-profile EOAs as "contract"
    // If behavioral signals are strongly human-like, fall through to Tier 2
    const quickHumanCheck = quickHumanSignalCheck(txs, addressInfo);
    if (quickHumanCheck.likelyHuman) {
      signals.push("Blockscout reports is_contract=true, but behavioral signals suggest EOA");
      signals.push(...quickHumanCheck.reasons);
      // Fall through to Tier 2 instead of returning immediately
    } else {
      signals.push("Address is a smart contract (Blockscout is_contract=true)");
      return {
        isDefinitelyContract: true,
        isERC4337,
        humanScore: 0,
        signals,
        tier1Decisive: true,
        confidence: computeConfidence(txs.length),
      };
    }
  }

  if (isERC4337) {
    signals.push("ERC-4337 account abstraction detected");
  }

  // ── Tier 2: Behavioral heuristics (EOA only) ──
  let humanScore = 50;

  if (txs.length < 3) {
    signals.push("Too few transactions for behavioral analysis");
    return { isDefinitelyContract: false, isERC4337, humanScore: 50, signals, tier1Decisive: false, confidence: computeConfidence(txs.length) };
  }

  humanScore = applyMethodConcentration(txs, humanScore, signals);
  humanScore = applyIntervalVariance(txs, humanScore, signals);
  humanScore = applyHourEntropy(txs, humanScore, signals);
  humanScore = applyZeroValueRate(txs, humanScore, signals);

  humanScore = applyCounterpartyConcentration(txs, humanScore, signals);
  humanScore = applyContractVsEOARatio(txs, humanScore, signals);
  humanScore = applyGasLimitConsistency(txs, humanScore, signals);
  humanScore = applyValueEntropy(txs, humanScore, signals);
  humanScore = applyNonceGapRate(txs, humanScore, signals);
  humanScore = applyBurstDetection(txs, humanScore, signals);

  if (addressInfo?.ensName && !addressInfo.isContract) {
    humanScore += 15;
    signals.push(`ENS name: ${addressInfo.ensName}`);
  }

  humanScore = Math.max(0, Math.min(100, humanScore));

  return { isDefinitelyContract: false, isERC4337, humanScore, signals, tier1Decisive: false, confidence: computeConfidence(txs.length) };
}

function applyMethodConcentration(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  const methodCounts = new Map<string, number>();
  for (const tx of txs) {
    const m = normalizeSelector(tx.methodId) ?? "0x";
    methodCounts.set(m, (methodCounts.get(m) ?? 0) + 1);
  }
  const topMethodPct = Math.max(...methodCounts.values()) / txs.length;
  if (topMethodPct > 0.8) {
    signals.push(`High method concentration: ${(topMethodPct * 100).toFixed(0)}% same method`);
    return score - 25;
  }
  if (topMethodPct < 0.3) {
    signals.push("Diverse method usage (human-like)");
    return score + 10;
  }
  return score;
}

function applyIntervalVariance(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  const timestamps = txs.map(tx => tx.timestamp).sort((a, b) => a - b);
  if (timestamps.length < 3) return score;

  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
  const variance = intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length;
  const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

  if (cv < 0.3) {
    signals.push(`Low interval variance (CV=${cv.toFixed(2)}) — bot-like regularity`);
    return score - 20;
  }
  if (cv > 1.5) {
    signals.push(`High interval variance (CV=${cv.toFixed(2)}) — human-like irregularity`);
    return score + 10;
  }
  return score;
}

function applyHourEntropy(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  const hourCounts = new Array(24).fill(0) as number[];
  for (const tx of txs) {
    hourCounts[new Date(tx.timestamp).getUTCHours()]++;
  }
  const activeHours = hourCounts.filter(c => c > 0).length;

  if (activeHours >= 20) {
    signals.push(`Active in ${activeHours}/24 hours — always-on pattern`);
    return score - 15;
  }
  if (activeHours <= 10) {
    signals.push(`Active in ${activeHours}/24 hours — working-hours pattern`);
    return score + 10;
  }
  return score;
}

function applyZeroValueRate(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  const zeroValueTxs = txs.filter(tx => tx.value === "0" || tx.value === "").length;
  const zeroValueRate = zeroValueTxs / txs.length;
  if (zeroValueRate > 0.7) {
    signals.push(`${(zeroValueRate * 100).toFixed(0)}% zero-value transactions — automation signal`);
    return score - 10;
  }
  return score;
}

function applyCounterpartyConcentration(
  txs: readonly TransactionSummary[],
  score: number,
  signals: string[],
): number {
  if (txs.length < 5) return score;
  const counts: Record<string, number> = {};
  for (const tx of txs) {
    if (tx.to) {
      const key = tx.to.toLowerCase();
      counts[key] = (counts[key] || 0) + 1;
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
  const limits = txs
    .filter((tx) => tx.gasLimit != null && tx.gasLimit !== "")
    .map((tx) => Number(tx.gasLimit))
    .filter((v) => !isNaN(v) && v > 0);
  if (limits.length < 10) return score;
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
  const buckets = [0, 0, 0, 0, 0, 0, 0];
  for (const tx of txs) {
    const val = parseFloat(tx.value || "0") / 1e18;
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
  const withNonce = txs.filter((tx) => tx.nonce != null);
  if (withNonce.length < 10) return score;
  const sorted = [...withNonce].sort((a, b) => a.nonce! - b.nonce!);
  let gaps = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].nonce! - sorted[i - 1].nonce! > 1) gaps++;
  }
  const rate = gaps / (withNonce.length - 1);
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

/**
 * Quick behavioral check to detect if an address flagged as "contract" by Blockscout
 * actually behaves like a human wallet (false positive guard).
 */
function quickHumanSignalCheck(
  txs: readonly TransactionSummary[],
  addressInfo?: AddressInfo,
): { likelyHuman: boolean; reasons: string[] } {
  if (txs.length < 5) return { likelyHuman: false, reasons: [] };

  const reasons: string[] = [];
  let humanSignals = 0;

  // Diverse methods = human-like
  const methods = new Set(txs.map(tx => normalizeSelector(tx.methodId) ?? "0x"));
  if (methods.size > 5) {
    humanSignals++;
    reasons.push(`Diverse methods (${methods.size} unique)`);
  }

  // Irregular timing = human-like
  const timestamps = txs.map(tx => tx.timestamp).sort((a, b) => a - b);
  const intervals: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    intervals.push(timestamps[i] - timestamps[i - 1]);
  }
  if (intervals.length > 2) {
    const mean = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    const cv = mean > 0
      ? Math.sqrt(intervals.reduce((s, v) => s + (v - mean) ** 2, 0) / intervals.length) / mean
      : 0;
    if (cv > 1.0) {
      humanSignals++;
      reasons.push(`High timing variance (CV=${cv.toFixed(2)})`);
    }
  }

  // ENS name = strong signal (weighted as 2)
  const hasENS = !!addressInfo?.ensName;
  if (hasENS) {
    humanSignals += 2;
    reasons.push(`Has ENS name: ${addressInfo!.ensName}`);
  }

  // Diverse counterparties = human-like
  const counterparties = new Set(txs.map(tx => tx.to?.toLowerCase()).filter(Boolean));
  if (counterparties.size > 10) {
    humanSignals++;
    reasons.push(`Many counterparties (${counterparties.size})`);
  }

  // Require 1 strong signal (ENS or high timing CV) + 1 weak, i.e. score >= 3
  return { likelyHuman: humanSignals >= 3, reasons };
}

function computeConfidence(txCount: number): "LOW" | "MEDIUM" | "HIGH" {
  if (txCount < 10) return "LOW";
  if (txCount <= 50) return "MEDIUM";
  return "HIGH";
}
