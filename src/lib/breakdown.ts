import type { AgentMetrics } from "./types";

interface BreakdownScores {
  readonly transactionPatterns: number;
  readonly contractInteractions: number;
  readonly fundFlow: number;
  readonly behavioralConsistency: number;
}

export function computeBreakdown(metrics: AgentMetrics, overallScore: number): BreakdownScores {
  // Raw axis scores (0-25 each)
  const tp = computeTransactionPatterns(metrics);
  const ci = computeContractInteractions(metrics);
  const ff = computeFundFlow(metrics);
  const bc = computeBehavioralConsistency(metrics);

  // Normalize so all 4 sum exactly to overallScore
  const rawSum = tp + ci + ff + bc;
  if (rawSum === 0) {
    // Even split
    const quarter = Math.floor(overallScore / 4);
    return {
      transactionPatterns: quarter,
      contractInteractions: quarter,
      fundFlow: quarter,
      behavioralConsistency: overallScore - quarter * 3,
    };
  }

  const scale = overallScore / rawSum;
  const raw = [tp, ci, ff, bc];
  const values = raw.map(v => Math.max(0, Math.min(25, Math.round(v * scale))));

  // Distribute remainder to uncapped axes (highest-raw first)
  const indices = [0, 1, 2, 3].sort((a, b) => raw[b] - raw[a]);
  let remainder = overallScore - values.reduce((s, v) => s + v, 0);
  for (const idx of indices) {
    if (remainder === 0) break;
    const headroom = remainder > 0 ? 25 - values[idx] : values[idx];
    if (headroom <= 0) continue;
    const delta = remainder > 0 ? Math.min(remainder, headroom) : Math.max(remainder, -headroom);
    values[idx] += delta;
    remainder -= delta;
  }

  return {
    transactionPatterns: values[0],
    contractInteractions: values[1],
    fundFlow: values[2],
    behavioralConsistency: values[3],
  };
}

function computeTransactionPatterns(m: AgentMetrics): number {
  let score = 12.5; // start at midpoint

  // Success rate: high = good
  score += (m.successRate - 0.5) * 10; // +/- 5

  // Tx frequency: some activity is good, too little is bad
  if (m.txFrequencyPerDay > 0.5) score += 3;
  if (m.txFrequencyPerDay > 5) score += 2;

  // Nonce gaps: bad signal
  if (m.nonceGaps > 5) score -= 3;
  if (m.nonceGaps > 20) score -= 3;

  // Gas activity: having spent gas shows real usage
  const gasETH = Number(m.totalGasSpentWei) / 1e18;
  if (gasETH > 0.01) score += 2;

  return Math.max(0, Math.min(25, Math.round(score)));
}

function computeContractInteractions(m: AgentMetrics): number {
  let score = 12.5;

  // Unique counterparties: diversity is good
  if (m.uniqueCounterparties > 5) score += 3;
  if (m.uniqueCounterparties > 20) score += 3;
  if (m.uniqueCounterparties <= 1) score -= 5;

  // Protocol count
  if (m.protocolsUsed.length > 2) score += 3;
  if (m.protocolsUsed.length > 5) score += 2;

  // Known agent type is good
  if (m.agentType !== "UNKNOWN") score += 2;

  // Is contract (more sophisticated)
  if (m.walletClassification.isDefinitelyContract) score += 1;

  return Math.max(0, Math.min(25, Math.round(score)));
}

function computeFundFlow(m: AgentMetrics): number {
  let score = 12.5;

  // Net flow analysis — context-sensitive, not magnitude-based
  try {
    const netFlow = parseFloat(m.netFlowETH);
    // Positive net flow (receiving more than sending) is neutral-to-good
    if (netFlow > 0 && netFlow < 100) score += 2;
    // Slight negative is normal for agents (gas costs)
    if (netFlow < 0 && netFlow > -10) score += 3;
    // Large negative AND few counterparties = draining pattern
    if (netFlow < -10 && m.uniqueCounterparties < 5) score -= 5;
    // Large negative but many counterparties = active agent with gas costs
    if (netFlow < -10 && m.uniqueCounterparties >= 5) score += 1;
    // Extreme inflow concentration = suspicious
    if (netFlow > 100) score -= 2;
  } catch { /* keep midpoint */ }

  // Largest single tx relative to total — sudden large moves are suspicious
  try {
    const largestETH = Number(BigInt(m.largestSingleTxWei) / 1_000_000_000_000_000n) / 1_000;
    if (largestETH > 10) score -= 3;
    if (largestETH < 0.1) score += 2;
  } catch { /* keep midpoint */ }

  return Math.max(0, Math.min(25, Math.round(score)));
}

function computeBehavioralConsistency(m: AgentMetrics): number {
  let score = 12.5;

  // Consistency score: high = regular behavior = good
  score += (m.consistencyScore - 0.5) * 10; // +/- 5

  // Hour spread: KEEPER agents benefit from 24/7 operation
  const activeHours = m.activeHoursUTC.filter(c => c > 0).length;
  if (m.agentType === "KEEPER" && activeHours >= 20) {
    score += 3; // expected for keepers
  } else if (activeHours >= 20) {
    score += 1; // slightly positive for others
  }

  // Frequency stability: consistent tx/day is good
  if (m.txFrequencyPerDay > 0 && m.consistencyScore > 0.6) score += 3;

  return Math.max(0, Math.min(25, Math.round(score)));
}
