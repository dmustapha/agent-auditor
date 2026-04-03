// ─── Shared Enrichment Pipeline ─────────────────────────────────────────────
// Encapsulates: computeBehavioralProfile → classifyEntityType → analyzeAgent
// Used by: web route, telegram bot, autonomous loop

import { computeBehavioralProfile } from "./behavioral-profile";
import { classifyEntityType } from "./entity-classifier";
import { createVeniceClient, analyzeAgent, resolveModel, createMockTrustScore } from "./venice";
import { validateTrustScore } from "./trust-score";
import type {
  AgentTransactionData, TrustScore, BehavioralProfile, EntityClassification,
} from "./types";

export interface EnrichAndAnalyzeInput {
  readonly agentData: AgentTransactionData;
  readonly totalTxCount?: number;
  readonly isERC8004Registered?: boolean;
}

export interface EnrichAndAnalyzeResult {
  readonly trustScore: TrustScore;
  readonly entityClassification: EntityClassification;
  readonly behavioralProfile: BehavioralProfile;
}

export async function enrichAndAnalyze(input: EnrichAndAnalyzeInput): Promise<EnrichAndAnalyzeResult> {
  const { agentData, totalTxCount, isERC8004Registered = false } = input;

  // 1. Behavioral profile (local computation, no external calls)
  const behavioralProfile = await computeBehavioralProfile(
    agentData.address,
    agentData.chainId,
    agentData.transactions,
    agentData.tokenTransfers,
    agentData.contractCalls,
    agentData.coinBalanceHistory ?? [],
    totalTxCount ?? agentData.addressInfo?.transactionsCount,
  );

  // 2. Entity classification (agent vs contract vs wallet)
  const entityClassification = classifyEntityType({
    address: agentData.address,
    transactions: agentData.transactions,
    addressInfo: agentData.addressInfo,
    smartContractData: agentData.smartContractData,
    walletClassification: agentData.computedMetrics?.walletClassification,
    isERC8004Registered,
  });

  // 3. Enrich data for Venice prompt
  const enrichedForVenice: AgentTransactionData = {
    ...agentData,
    behavioralProfile,
    entityClassification,
    sampleContext: behavioralProfile.sampleContext,
  };

  // 4. Analyze via Venice (or mock)
  const useMock = process.env.VENICE_MOCK === "true";
  let trustScore: TrustScore;

  if (useMock) {
    trustScore = createMockTrustScore(
      agentData.address,
      agentData.chainId,
      agentData.transactions.length,
    );
  } else {
    const apiKey = process.env.VENICE_API_KEY;
    if (!apiKey) throw new Error("Venice API key not configured");
    const client = createVeniceClient(apiKey);
    const model = await resolveModel(client);
    const raw = await analyzeAgent(client, enrichedForVenice, model);
    trustScore = validateTrustScore(raw);
  }

  return { trustScore, entityClassification, behavioralProfile };
}
