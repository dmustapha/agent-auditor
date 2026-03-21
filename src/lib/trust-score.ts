import { toHex } from "viem";
import type { TrustScore, TrustFlag, UITrustScore } from "./types";
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

  return score as unknown as TrustScore;
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

// ─── Format for Telegram ─────────────────────────────────────────────────────

export function formatForTelegram(score: TrustScore): string {
  const emoji = score.recommendation === "SAFE" ? "✅" :
    score.recommendation === "CAUTION" ? "⚠️" : "🚫";

  const chainConfig = getChainConfig(score.chainId);

  const flagLines = score.flags
    .filter((f) => f.severity === "CRITICAL" || f.severity === "HIGH")
    .map((f) => `  • [${f.severity}] ${f.description}`)
    .join("\n");

  return `${emoji} *AgentAuditor Alert*

*Address:* \`${score.agentAddress}\`
*Chain:* ${chainConfig.name}
*Score:* ${score.overallScore}/100 — *${score.recommendation}*

*Breakdown:*
  Txn Patterns: ${score.breakdown.transactionPatterns}/25
  Contract Int: ${score.breakdown.contractInteractions}/25
  Fund Flow: ${score.breakdown.fundFlow}/25
  Consistency: ${score.breakdown.behavioralConsistency}/25

${flagLines ? `*Flags:*\n${flagLines}\n` : ""}*Summary:* ${score.summary}`;
}

// ─── Format for UI ───────────────────────────────────────────────────────────

export function formatForUI(score: TrustScore): UITrustScore {
  const chainConfig = getChainConfig(score.chainId);

  const recommendationColors: Record<string, string> = {
    SAFE: "#22c55e",
    CAUTION: "#eab308",
    BLOCKLIST: "#ef4444",
  };

  return {
    address: score.agentAddress,
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
  };
}
