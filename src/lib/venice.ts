import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChainId, AgentTransactionData, AgentType, AgentMetrics, TrustScore, TrustFlag } from "./types";
import { sanitizeForPrompt } from "./sanitize";

// ─── Constants ───────────────────────────────────────────────────────────────

const VENICE_BASE_URL = "https://api.venice.ai/api/v1";

// [ASSUMED] Model IDs — verify at runtime via GET /api/v1/models
const PRIMARY_MODEL = "llama-3.3-70b";
const FALLBACK_MODEL = "mistral-31-24b";

// ─── Venice-Specific Parameters ──────────────────────────────────────────────

interface VeniceParameters {
  enable_e2ee?: boolean;
  include_venice_system_prompt?: boolean;
}

// ─── Client Factory (singleton) ─────────────────────────────────────────────

let _veniceClient: OpenAI | null = null;
let _veniceApiKey: string | null = null;
let _resolvedModel: string | null = null;

export function createVeniceClient(apiKey: string): OpenAI {
  if (!_veniceClient || _veniceApiKey !== apiKey) {
    _veniceClient = new OpenAI({ apiKey, baseURL: VENICE_BASE_URL });
    _veniceApiKey = apiKey;
    _resolvedModel = null;
  }
  return _veniceClient;
}

// ─── Runtime Model Verification ──────────────────────────────────────────────

export async function listAvailableModels(client: OpenAI): Promise<string[]> {
  const models = await client.models.list();
  return models.data.map((m) => m.id);
}

/**
 * Find the best available model matching our preferences.
 * Falls back through: PRIMARY_MODEL → FALLBACK_MODEL → first llama → first mistral → any model.
 */
export async function resolveModel(client: OpenAI): Promise<string> {
  if (_resolvedModel) return _resolvedModel;

  const available = await listAvailableModels(client);

  if (available.includes(PRIMARY_MODEL)) { _resolvedModel = PRIMARY_MODEL; return _resolvedModel; }
  if (available.includes(FALLBACK_MODEL)) { _resolvedModel = FALLBACK_MODEL; return _resolvedModel; }

  const llama = available.find((m) => m.includes("llama"));
  if (llama) { _resolvedModel = llama; return _resolvedModel; }

  const mistral = available.find((m) => m.includes("mistral"));
  if (mistral) { _resolvedModel = mistral; return _resolvedModel; }

  if (available.length > 0) { _resolvedModel = available[0]; return _resolvedModel; }

  throw new Error("No models available on Venice");
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are AgentAuditor, an AI security analyst specializing in onchain autonomous agent behavior across EVM chains.

Your task: analyze transaction data for an AI agent address and produce a structured trust score with deep behavioral analysis.

ANALYSIS FRAMEWORK:
1. Transaction Patterns (0-25 points)
   - Regular vs erratic timing
   - Gas usage efficiency (wasteful = suspicious)
   - Transaction volume relative to agent type
   - Nonce gaps (skipped transactions)

2. Contract Interactions (0-25 points)
   - Interactions with verified/known-good contracts (+)
   - Interactions with unverified contracts (-)
   - Diversity of protocols used
   - Proxy contract usage patterns

3. Fund Flow Analysis (0-25 points)
   - Fund sources (CEX, bridges, mixers, fresh wallets)
   - Destination analysis (known protocols vs unknown EOAs)
   - Circular fund patterns (wash trading signals)
   - Large sudden transfers

4. Behavioral Consistency (0-25 points)
   - Does onchain behavior match declared agent purpose?
   - Consistency of operations over time
   - Anomalous deviations from baseline
   - Permission escalation patterns

AGENT TYPE CLASSIFICATION:
Classify the agent as one of: KEEPER, ORACLE, LIQUIDATOR, MEV_BOT, BRIDGE_RELAYER, DEX_TRADER, GOVERNANCE, YIELD_OPTIMIZER, UNKNOWN

FLAGS:
- CRITICAL: Direct interaction with known exploit contracts, mixer usage, drain patterns
- HIGH: Unverified contract deployment, large unexplained transfers, nonce manipulation
- MEDIUM: Irregular timing, high gas waste, interaction with low-trust addresses
- LOW: Minor deviations, new agent with limited history

RECOMMENDATION:
- SAFE: Score >= 70, no CRITICAL flags
- CAUTION: Score 40-69 OR any HIGH flags
- BLOCKLIST: Score < 40 OR any CRITICAL flags

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

You MUST respond ONLY with a JSON object in EXACTLY this structure (no markdown, no explanation, no extra fields):

{
  "agentAddress": "0x...",
  "overallScore": 75,
  "breakdown": {
    "transactionPatterns": 20,
    "contractInteractions": 18,
    "fundFlow": 22,
    "behavioralConsistency": 15
  },
  "flags": [{"severity": "MEDIUM", "category": "gas_usage", "description": "...", "evidence": "..."}],
  "summary": "Agent shows normal behavior with minor anomalies.",
  "recommendation": "SAFE",
  "analysisTimestamp": "2026-03-20T12:00:00Z",
  "agentType": "KEEPER",
  "behavioralNarrative": "This agent operates as a Chainlink Keeper, executing upkeep tasks every ~4 hours with high consistency.",
  "performanceScore": 85,
  "operationalPattern": {
    "avgIntervalHours": 4.2,
    "peakHoursUTC": [8, 14, 20],
    "consistencyScore": 0.92
  },
  "financialSummary": {
    "totalGasSpentETH": "0.42",
    "netFlowETH": "-0.42",
    "largestSingleTxETH": "0.003"
  },
  "protocolsUsed": ["Chainlink Automation", "Uniswap V3"],
  "funFact": "This agent has executed 1,247 upkeeps without a single failure.",
  "anomalies": ["Unusual 12-hour gap on March 15"],
  "isLikelyHumanWallet": false
}

The four breakdown values MUST sum to overallScore (±1 rounding). Each breakdown value is 0-25. overallScore is 0-100.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripMarkdownFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

function normalizeVeniceResponse(
  raw: Record<string, unknown>,
  address: string,
  chainId: ChainId,
  metrics?: AgentMetrics,
): TrustScore {
  // Handle alternate field names Venice models sometimes use
  const score = (raw.overallScore ?? raw.trustScore ?? raw.score ?? 50) as number;

  const breakdown = (raw.breakdown as Record<string, number> | undefined) ?? {
    transactionPatterns: Math.round(score * 0.25),
    contractInteractions: Math.round(score * 0.28),
    fundFlow: Math.round(score * 0.22),
    behavioralConsistency: 0,
  };
  // Ensure behavioralConsistency fills any gap so breakdown sums to score
  const partial = (breakdown.transactionPatterns ?? 0) +
    (breakdown.contractInteractions ?? 0) +
    (breakdown.fundFlow ?? 0);
  breakdown.behavioralConsistency = Math.max(0, Math.min(25, score - partial));

  // Normalize flags — may be string[] or object[]
  const VALID_SEVERITIES = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
  const rawFlags = (raw.flags ?? []) as unknown[];
  const flags: TrustFlag[] = rawFlags.map((f) => {
    if (typeof f === "string") {
      const upper = f.toUpperCase();
      return {
        severity: (VALID_SEVERITIES.has(upper) ? upper : "LOW") as TrustFlag["severity"],
        category: "general",
        description: f,
        evidence: "",
      };
    }
    const flag = f as Record<string, unknown>;
    const sev = String(flag.severity ?? "LOW").toUpperCase();
    return {
      severity: (VALID_SEVERITIES.has(sev) ? sev : "LOW") as TrustFlag["severity"],
      category: String(flag.category ?? "general"),
      description: String(flag.description ?? ""),
      evidence: String(flag.evidence ?? ""),
    };
  });

  const recommendation = (raw.recommendation as string | undefined) ??
    (score >= 70 ? "SAFE" : score >= 40 ? "CAUTION" : "BLOCKLIST");

  const opPattern = raw.operationalPattern as Record<string, unknown> | undefined;
  const finSummary = raw.financialSummary as Record<string, string> | undefined;

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

  return {
    agentAddress: (raw.agentAddress as string | undefined) ?? address,
    chainId,
    overallScore: score,
    breakdown: {
      transactionPatterns: breakdown.transactionPatterns ?? 0,
      contractInteractions: breakdown.contractInteractions ?? 0,
      fundFlow: breakdown.fundFlow ?? 0,
      behavioralConsistency: breakdown.behavioralConsistency,
    },
    flags,
    summary: (raw.summary as string | undefined) ?? `Score: ${score}/100`,
    recommendation: recommendation as "SAFE" | "CAUTION" | "BLOCKLIST",
    analysisTimestamp: (raw.analysisTimestamp as string | undefined) ?? new Date().toISOString(),
    agentType: (raw.agentType as AgentType | undefined) ?? "UNKNOWN",
    behavioralNarrative: (raw.behavioralNarrative as string | undefined) ?? "Behavioral analysis not available.",
    performanceScore: typeof raw.performanceScore === "number" ? raw.performanceScore : score,
    operationalPattern: {
      avgIntervalHours: (opPattern?.avgIntervalHours as number | undefined) ?? 0,
      peakHoursUTC: (opPattern?.peakHoursUTC as number[] | undefined) ?? [],
      consistencyScore: (opPattern?.consistencyScore as number | undefined) ?? 0,
    },
    financialSummary: computedFinancials ?? {
      totalGasSpentETH: finSummary?.totalGasSpentETH ?? "0",
      netFlowETH: finSummary?.netFlowETH ?? "0",
      largestSingleTxETH: finSummary?.largestSingleTxETH ?? "0",
    },
    protocolsUsed: overriddenProtocols,
    funFact: (raw.funFact as string | undefined) ?? "",
    anomalies: (raw.anomalies as string[] | undefined) ?? [],
    isLikelyHumanWallet: humanWallet,
    walletClassification: walletClass,
  };
}

// ─── Sanitization ───────────────────────────────────────────────────────────

function sanitizeAgentDataForPrompt(data: AgentTransactionData): AgentTransactionData {
  return {
    ...data,
    transactions: data.transactions.map(tx => ({
      ...tx,
      methodId: sanitizeForPrompt(tx.methodId, 20),
      from: sanitizeForPrompt(tx.from, 42),
      to: sanitizeForPrompt(tx.to, 42),
    })),
    tokenTransfers: data.tokenTransfers.map(t => ({
      ...t,
      token: sanitizeForPrompt(t.token, 50),
    })),
  };
}

// ─── Analysis Function ───────────────────────────────────────────────────────

export async function analyzeAgent(
  client: OpenAI,
  data: AgentTransactionData,
  model?: string,
): Promise<TrustScore> {
  const modelId = model ?? PRIMARY_MODEL;
  const sanitizedData = sanitizeAgentDataForPrompt(data);

  const metrics = sanitizedData.computedMetrics;
  const metricsSection = metrics ? `
=== COMPUTED METRICS ===
Avg gas per tx: ${metrics.avgGasPerTx.toFixed(0)} | Total gas spent: ${(Number(metrics.totalGasSpentWei) / 1e18).toFixed(6)} ETH | Tx frequency: ${metrics.txFrequencyPerDay.toFixed(2)} tx/day
Active hours UTC: [${metrics.activeHoursUTC.join(",")}]
Success rate: ${(metrics.successRate * 100).toFixed(1)}% | Unique counterparties: ${metrics.uniqueCounterparties}
Largest single tx: ${(Number(BigInt(metrics.largestSingleTxWei)) / 1e18).toFixed(6)} ETH | Nonce gaps: ${metrics.nonceGaps}
First seen: ${metrics.firstSeenTimestamp ? new Date(metrics.firstSeenTimestamp).toISOString() : "N/A"} | Last seen: ${metrics.lastSeenTimestamp ? new Date(metrics.lastSeenTimestamp).toISOString() : "N/A"}
Pre-classified agent type: ${metrics.agentType} | ERC-4337: ${metrics.isERC4337}
Most called contracts: ${metrics.mostCalledContracts.slice(0, 5).join(", ") || "N/A"}
` : "";

  const walletSection = metrics?.walletClassification ? `
=== WALLET CLASSIFICATION (GROUND TRUTH) ===
Human score: ${metrics.walletClassification.humanScore}/100
Is contract: ${metrics.walletClassification.isDefinitelyContract}
Is ERC-4337: ${metrics.walletClassification.isERC4337}
Tier 1 decisive: ${metrics.walletClassification.tier1Decisive}
Signals:
${metrics.walletClassification.signals.map(s => `  - ${s}`).join("\n")}
` : "";

  const groundTruthSection = metrics ? `
=== GROUND TRUTH VALUES (use these, do not fabricate) ===
Success rate: ${(metrics.successRate * 100).toFixed(1)}%
Net ETH flow: ${metrics.netFlowETH} ETH
Protocols detected: ${metrics.protocolsUsed.length > 0 ? metrics.protocolsUsed.join(", ") : "none detected locally"}
Total gas spent: ${(Number(metrics.totalGasSpentWei) / 1e18).toFixed(6)} ETH
Largest single tx: ${(Number(BigInt(metrics.largestSingleTxWei)) / 1e18).toFixed(6)} ETH
` : "";

  const contractSection = sanitizedData.smartContractData ? `
=== CONTRACT DATA ===
Verified: ${sanitizedData.smartContractData.isVerified} | Name: ${sanitizedData.smartContractData.name ?? "N/A"}
` : "";

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

  const eventsSection = sanitizedData.eventLogs?.length ? `
=== RECENT EVENTS (last 10) ===
${JSON.stringify(sanitizedData.eventLogs.slice(-10), null, 2)}
` : "";

  const addressInfoSection = sanitizedData.addressInfo ? `
=== ADDRESS INFO ===
Type: ${sanitizedData.addressInfo.addressType}
Is contract: ${sanitizedData.addressInfo.isContract}
ENS: ${sanitizedData.addressInfo.ensName ?? "none"}
Implementation: ${sanitizedData.addressInfo.implementationAddress ?? "N/A"}
` : "";

  const userMessage = `Analyze this ${sanitizedData.chainId.toUpperCase()} chain agent:

Address: ${sanitizedData.address}
Chain: ${sanitizedData.chainId}
Transaction count: ${sanitizedData.transactions.length}
Token transfer count: ${sanitizedData.tokenTransfers.length}
Unique contracts called: ${new Set(sanitizedData.contractCalls.map((c) => c.contract)).size}
${metricsSection}${walletSection}${groundTruthSection}${addressInfoSection}${contractSection}${balanceSection}${eventsSection}
=== RECENT TRANSACTIONS (last 20) ===
${JSON.stringify(sanitizedData.transactions.slice(-20), null, 2)}

Token transfers (last 20):
${JSON.stringify(sanitizedData.tokenTransfers.slice(-20), null, 2)}

Contract interactions (last 20):
${JSON.stringify(sanitizedData.contractCalls.slice(-20), null, 2)}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  // Venice doesn't support json_schema response_format — rely on system prompt + JSON parsing
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90_000);

  let response;
  try {
    response = await client.chat.completions.create(
      {
        model: modelId,
        messages,
        temperature: 0.1,
        max_tokens: 2000,
        // @ts-expect-error venice_parameters not in OpenAI types
        venice_parameters: {
          enable_e2ee: true,
          include_venice_system_prompt: false,
        } satisfies VeniceParameters,
      },
      { signal: controller.signal },
    );
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Venice AI timed out after 90 seconds. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from Venice");
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stripMarkdownFences(content));
  } catch {
    throw new Error("Venice returned invalid JSON. Please try again.");
  }
  const normalized = normalizeVeniceResponse(parsed, data.address, data.chainId, data.computedMetrics);

  return normalized;
}

// ─── Mock Mode (for development — saves Venice prompts) ──────────────────────

export function createMockTrustScore(
  address: string,
  chainId: ChainId,
  txCount: number,
): TrustScore {
  // Deterministic mock based on address — same input always gives same output
  const addrNum = parseInt(address.slice(2, 10), 16);
  const baseScore = (addrNum % 80) + 10; // 10-89

  const tp = Math.min(25, Math.floor(baseScore * 0.25));
  const ci = Math.min(25, Math.floor(baseScore * 0.28));
  const ff = Math.min(25, Math.floor(baseScore * 0.22));
  const bc = baseScore - tp - ci - ff;

  const flags: TrustFlag[] = [];
  if (baseScore < 40) {
    flags.push({
      severity: "CRITICAL",
      category: "fund_flow",
      description: "Rapid fund draining pattern detected",
      evidence: `${txCount} transactions with decreasing balance trend`,
    });
  }
  if (baseScore < 60) {
    flags.push({
      severity: "HIGH",
      category: "contract_interaction",
      description: "Interaction with unverified contracts",
      evidence: "Multiple calls to unverified contract addresses",
    });
  }

  const recommendation = baseScore >= 70 ? "SAFE" : baseScore >= 40 ? "CAUTION" : "BLOCKLIST";

  return {
    agentAddress: address,
    chainId,
    overallScore: baseScore,
    breakdown: {
      transactionPatterns: tp,
      contractInteractions: ci,
      fundFlow: ff,
      behavioralConsistency: Math.max(0, Math.min(25, bc)),
    },
    flags,
    summary: `Mock analysis: ${recommendation} with score ${baseScore}/100. ${txCount} transactions analyzed on ${chainId}.`,
    recommendation,
    analysisTimestamp: new Date().toISOString(),
    agentType: "KEEPER" as AgentType,
    behavioralNarrative: `Mock agent on ${chainId} with ${txCount} transactions. Exhibits automated keeper-like behavior patterns.`,
    performanceScore: baseScore,
    operationalPattern: {
      avgIntervalHours: 4.2,
      peakHoursUTC: [8, 14, 20],
      consistencyScore: 0.85,
    },
    financialSummary: {
      totalGasSpentETH: "0.042",
      netFlowETH: "-0.042",
      largestSingleTxETH: "0.003",
    },
    protocolsUsed: ["Chainlink Automation"],
    funFact: `This mock agent has been analyzed ${txCount} transactions deep.`,
    anomalies: [],
    isLikelyHumanWallet: false,
  };
}
