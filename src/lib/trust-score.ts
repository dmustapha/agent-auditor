import { toHex } from "viem";
import type { TrustScore, TrustFlag, UITrustScore, BehavioralProfile, EntityType } from "./types";
import { getChainConfig } from "./chains";

// ─── Validation ──────────────────────────────────────────────────────────────

export function validateTrustScore(raw: unknown): TrustScore {
  const score = raw as Record<string, unknown>;

  if (typeof score.overallScore !== "number" || score.overallScore < 0 || score.overallScore > 100) {
    throw new Error(`Invalid overallScore: ${score.overallScore}`);
  }

  const breakdown = score.breakdown as Record<string, number>;
  for (const key of ["transactionPatterns", "contractInteractions", "fundFlow", "behavioralConsistency"]) {
    if (typeof breakdown[key] !== "number" || breakdown[key] < 0 || breakdown[key] > 25) {
      throw new Error(`Invalid breakdown.${key}: ${breakdown[key]}`);
    }
  }

  const sum = breakdown.transactionPatterns + breakdown.contractInteractions +
    breakdown.fundFlow + breakdown.behavioralConsistency;
  if (Math.abs(sum - (score.overallScore as number)) > 5) {
    throw new Error(`Breakdown sum ${sum} diverges from overallScore ${score.overallScore} by >5`);
  }

  if (!["SAFE", "CAUTION", "BLOCKLIST"].includes(score.recommendation as string)) {
    throw new Error(`Invalid recommendation: ${score.recommendation}`);
  }

  // Auto-correct recommendation if inconsistent with score + flags
  const validated = score as unknown as TrustScore;
  const expectedRec = scoreToRecommendation(validated.overallScore, validated.flags ?? []);
  if (validated.recommendation !== expectedRec) {
    console.warn(`[validateTrustScore] Correcting recommendation: ${validated.recommendation} → ${expectedRec} (score=${validated.overallScore})`);
    return { ...validated, recommendation: expectedRec } as TrustScore;
  }

  return validated;
}

// ─── Recommendation Logic ────────────────────────────────────────────────────

export function scoreToRecommendation(
  score: number,
  flags: readonly TrustFlag[],
): "SAFE" | "CAUTION" | "BLOCKLIST" {
  const hasCritical = flags.some((f) => f.severity === "CRITICAL");
  if (hasCritical || score < 40) return "BLOCKLIST";

  const hasHigh = flags.some((f) => f.severity === "HIGH");
  if (hasHigh || score < 70) return "CAUTION";

  return "SAFE";
}

// ─── Format for Attestation ──────────────────────────────────────────────────

export function formatForAttestation(score: TrustScore): {
  value: bigint;
  decimals: number;
  tag1: `0x${string}`;
  tag2: `0x${string}`;
} {
  // SAFE → positive int128, CAUTION → zero, BLOCKLIST → negative int128
  let value: bigint;
  if (score.recommendation === "SAFE") {
    value = BigInt(score.overallScore);
  } else if (score.recommendation === "CAUTION") {
    value = 0n; // neutral attestation
  } else {
    value = BigInt(-score.overallScore); // negative for BLOCKLIST
  }

  return {
    value,
    decimals: 0,
    tag1: toHex("trustScore/overall", { size: 32 }),
    tag2: toHex("trustScore/security", { size: 32 }),
  };
}

// ─── Format Helpers ──────────────────────────────────────────────────────────

function relativeTime(timestampMs: number): string {
  const diff = Date.now() - timestampMs;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "< 1hr ago";
  if (hours < 24) return `${hours}hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function ageDays(firstMs: number, lastMs: number): number {
  return Math.max(1, Math.round((lastMs - firstMs) / 86_400_000));
}

function formatGas(gasPerTx: number): string {
  if (gasPerTx >= 1_000_000) return `${(gasPerTx / 1_000_000).toFixed(1)}M`;
  if (gasPerTx >= 1_000) return `${(gasPerTx / 1_000).toFixed(1)}k`;
  return `${Math.round(gasPerTx)}`;
}

const TREND_ICON = { accumulating: "↗", depleting: "↘", stable: "→" } as const;

// ─── Format for Telegram ─────────────────────────────────────────────────────

export function formatForTelegram(score: TrustScore, ensName?: string | null): string {
  const titleByEntity: Record<EntityType, string> = {
    AUTONOMOUS_AGENT: "Agent Trust Score",
    PROTOCOL_CONTRACT: "Protocol Health Check",
    USER_WALLET: "Wallet Analysis",
    UNKNOWN: "Address Analysis",
  };
  const reportTitle = titleByEntity[score.entityType ?? "AUTONOMOUS_AGENT"] ?? "AgentAuditor Intelligence Report";

  const emoji = score.recommendation === "SAFE" ? "✅" :
    score.recommendation === "CAUTION" ? "⚠️" : "🚫";

  const chainConfig = getChainConfig(score.chainId);
  const addr = score.agentAddress;
  const shortAddr = `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const displayName = ensName ? `${ensName} (${shortAddr})` : shortAddr;

  // ── Identity ──
  const age = score.firstSeenTimestamp && score.lastSeenTimestamp
    ? `${ageDays(score.firstSeenTimestamp, score.lastSeenTimestamp)} days`
    : null;
  const lastActive = score.lastSeenTimestamp ? relativeTime(score.lastSeenTimestamp) : null;
  const txCount = score.totalTransactions ?? 0;
  const identityParts = [age ? `Age: ${age}` : null, `${txCount} txns`, lastActive ? `Last: ${lastActive}` : null].filter(Boolean);

  // ── Score bar ──
  const filled = Math.round(score.overallScore / 10);
  const bar = "█".repeat(filled) + "░".repeat(10 - filled);

  // ── Breakdown ──
  const bd = score.breakdown;
  const indicator = (v: number) => v >= 18 ? "✓" : v <= 10 ? "✗" : "~";
  const breakdownLines = [
    `  ${indicator(bd.transactionPatterns)} Txn Patterns     ${bd.transactionPatterns}/25`,
    `  ${indicator(bd.contractInteractions)} Contract Int.    ${bd.contractInteractions}/25`,
    `  ${indicator(bd.fundFlow)} Fund Flow        ${bd.fundFlow}/25`,
    `  ${indicator(bd.behavioralConsistency)} Consistency      ${bd.behavioralConsistency}/25`,
  ].join("\n");

  // ── Operational ──
  const op = score.operationalPattern;
  const opParts: string[] = [];
  if (op.avgIntervalHours > 0) opParts.push(`Avg interval: ${op.avgIntervalHours}hr`);
  if (op.peakHoursUTC.length > 0) {
    const peakStr = op.peakHoursUTC.length <= 3
      ? op.peakHoursUTC.map(h => `${h}:00`).join(", ")
      : `${op.peakHoursUTC[0]}:00–${op.peakHoursUTC[op.peakHoursUTC.length - 1]}:00`;
    opParts.push(`Peak: ${peakStr} UTC`);
  }
  if (op.consistencyScore > 0) opParts.push(`Consistency: ${Math.round(op.consistencyScore * 100)}%`);
  if (score.avgGasPerTx) opParts.push(`Gas/tx: ${formatGas(score.avgGasPerTx)}`);
  if (score.txFrequencyPerDay) opParts.push(`${score.txFrequencyPerDay.toFixed(1)} tx/day`);
  const operationalSection = opParts.length > 0
    ? `\n*Operational:*\n  ${opParts.join(" | ")}`
    : "";

  // ── Strategy ──
  const ap = score.activityProfile;
  let strategySection = "";
  if (ap) {
    const parts: string[] = [];
    if (ap.primaryActivity) parts.push(`  ${ap.primaryActivity}`);
    if (ap.protocolBreakdown.length > 0) {
      parts.push(`  ${ap.protocolBreakdown.map(p => `${p.protocol} ${p.percentage}%`).join(" | ")}`);
    }
    const successStr = score.successRate != null ? `Success: ${(score.successRate * 100).toFixed(1)}%` : null;
    const netStr = score.financialSummary.netFlowETH !== "0" ? `Net: ${score.financialSummary.netFlowETH} ETH` : null;
    const metricsLine = [successStr, netStr].filter(Boolean).join(" | ");
    if (metricsLine) parts.push(`  ${metricsLine}`);
    strategySection = `\n*Strategy:*\n${parts.join("\n")}`;
  }

  // ── Financials ──
  const fin = score.financialSummary;
  const trend = score.balanceTrend ? ` ${TREND_ICON[score.balanceTrend]} ${score.balanceTrend}` : "";
  const financialSection = `\n*Financials:*
  Gas burned: ${fin.totalGasSpentETH} ETH
  Net flow: ${fin.netFlowETH} ETH | Largest tx: ${fin.largestSingleTxETH} ETH${trend ? `\n  Balance:${trend}` : ""}`;

  // ── Flags ──
  const flagsByLevel = [
    { flags: score.flags.filter((f) => f.severity === "CRITICAL"), icon: "🔴" },
    { flags: score.flags.filter((f) => f.severity === "HIGH"), icon: "🟠" },
    { flags: score.flags.filter((f) => f.severity === "MEDIUM"), icon: "🟡" },
  ];
  const flagLines = flagsByLevel
    .flatMap(({ flags, icon }) => flags.map((f) => `  ${icon} ${f.description}`))
    .join("\n");

  // ── Counterparties ──
  let counterpartySection = "";
  if (score.mostCalledContracts && score.mostCalledContracts.length > 0) {
    const top = score.mostCalledContracts.slice(0, 3).map(c => `${c.slice(0, 8)}...`).join(" | ");
    const uniqueStr = score.uniqueCounterparties ? ` | ${score.uniqueCounterparties} unique` : "";
    counterpartySection = `\n*Top Contracts:*\n  ${top}${uniqueStr}`;
  }

  // ── Fun Fact ──
  const funFactSection = score.funFact ? `\n💡 _"${score.funFact}"_` : "";

  // ── Assemble ──
  const typeBadge = score.agentType && score.agentType !== "UNKNOWN" ? `  ${score.agentType}` : "";

  return `${emoji} *AgentAuditor ${reportTitle}*

*${displayName}*${typeBadge} on *${chainConfig.name}*
${identityParts.length > 0 ? identityParts.join(" | ") : ""}${score.entityType === "PROTOCOL_CONTRACT" ? "\n⚙️ _This is a protocol contract, not an autonomous agent._\n" : ""}${score.entityType === "USER_WALLET" ? "\n👤 _This appears to be a human wallet, not an autonomous agent._\n" : ""}

*TRUST SCORE: ${score.overallScore}/100 | ${score.recommendation}*
\`${bar}\`

*Breakdown:*
${breakdownLines}${operationalSection}${strategySection}${financialSection}
${flagLines ? `\n*Flags:*\n${flagLines}` : ""}${counterpartySection}${funFactSection}

${score.behavioralNarrative ? `_${score.behavioralNarrative}_` : ""}`;
}

// ─── Format for UI ───────────────────────────────────────────────────────────

export function formatForUI(score: TrustScore, opts?: {
  successRate?: number;
  ethPrice?: number;
  behavioralProfile?: BehavioralProfile;
  ensName?: string | null;
}): UITrustScore {
  const { successRate, ethPrice, behavioralProfile, ensName } = opts ?? {};
  const chainConfig = getChainConfig(score.chainId);

  const recommendationColors: Record<string, string> = {
    SAFE: "#22c55e",
    CAUTION: "#eab308",
    BLOCKLIST: "#ef4444",
  };

  return {
    address: score.agentAddress,
    ensName,
    chainId: score.chainId,
    chainName: chainConfig.name,
    score: score.overallScore,
    maxScore: 100,
    breakdown: [
      { label: "Transaction Patterns", value: score.breakdown.transactionPatterns, max: 25 },
      { label: "Contract Interactions", value: score.breakdown.contractInteractions, max: 25 },
      { label: "Fund Flow", value: score.breakdown.fundFlow, max: 25 },
      { label: "Behavioral Consistency", value: score.breakdown.behavioralConsistency, max: 25 },
    ],
    recommendation: score.recommendation,
    recommendationColor: recommendationColors[score.recommendation],
    flags: score.flags,
    summary: score.summary,
    timestamp: score.analysisTimestamp,
    agentType: score.agentType,
    behavioralNarrative: score.behavioralNarrative,
    performanceScore: score.performanceScore,
    operationalPattern: score.operationalPattern,
    financialSummary: score.financialSummary,
    protocolsUsed: score.protocolsUsed,
    funFact: score.funFact,
    anomalies: score.anomalies,
    isLikelyHumanWallet: score.isLikelyHumanWallet,
    walletClassification: score.walletClassification,
    activityProfile: score.activityProfile,
    successRate: successRate ?? score.successRate,
    ethPrice,
    totalTransactions: score.totalTransactions,
    avgGasPerTx: score.avgGasPerTx,
    nonceGaps: score.nonceGaps,
    firstSeenTimestamp: score.firstSeenTimestamp,
    lastSeenTimestamp: score.lastSeenTimestamp,
    mostCalledContracts: score.mostCalledContracts,
    uniqueCounterparties: score.uniqueCounterparties,
    txFrequencyPerDay: score.txFrequencyPerDay,
    balanceTrend: score.balanceTrend,
    behavioralProfile,
    entityType: score.entityType,
    entityClassification: score.entityClassification,
    sampleContext: opts?.behavioralProfile?.sampleContext,
  };
}
