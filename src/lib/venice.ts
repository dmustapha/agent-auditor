import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChainId, AgentTransactionData, TrustScore, TrustFlag } from "./types";

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

// ─── Client Factory ──────────────────────────────────────────────────────────

export function createVeniceClient(apiKey: string): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: VENICE_BASE_URL,
  });
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
  const available = await listAvailableModels(client);

  if (available.includes(PRIMARY_MODEL)) return PRIMARY_MODEL;
  if (available.includes(FALLBACK_MODEL)) return FALLBACK_MODEL;

  const llama = available.find((m) => m.includes("llama"));
  if (llama) return llama;

  const mistral = available.find((m) => m.includes("mistral"));
  if (mistral) return mistral;

  if (available.length > 0) return available[0];

  throw new Error("No models available on Venice");
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are AgentAuditor, an AI security analyst specializing in onchain autonomous agent behavior across EVM chains.

Your task: analyze transaction data for an AI agent address and produce a structured trust score.

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

FLAGS:
- CRITICAL: Direct interaction with known exploit contracts, mixer usage, drain patterns
- HIGH: Unverified contract deployment, large unexplained transfers, nonce manipulation
- MEDIUM: Irregular timing, high gas waste, interaction with low-trust addresses
- LOW: Minor deviations, new agent with limited history

RECOMMENDATION:
- SAFE: Score >= 70, no CRITICAL flags
- CAUTION: Score 40-69 OR any HIGH flags
- BLOCKLIST: Score < 40 OR any CRITICAL flags

Respond ONLY with valid JSON matching the provided schema. No markdown, no explanation outside JSON.`;

// ─── JSON Schema for Structured Output ───────────────────────────────────────

const TRUST_SCORE_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "trust_score",
    strict: true,
    schema: {
      type: "object",
      properties: {
        agentAddress: { type: "string" },
        overallScore: { type: "number" },
        breakdown: {
          type: "object",
          properties: {
            transactionPatterns: { type: "number" },
            contractInteractions: { type: "number" },
            fundFlow: { type: "number" },
            behavioralConsistency: { type: "number" },
          },
          required: [
            "transactionPatterns",
            "contractInteractions",
            "fundFlow",
            "behavioralConsistency",
          ],
          additionalProperties: false,
        },
        flags: {
          type: "array",
          items: {
            type: "object",
            properties: {
              severity: { type: "string", enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] },
              category: { type: "string" },
              description: { type: "string" },
              evidence: { type: "string" },
            },
            required: ["severity", "category", "description", "evidence"],
            additionalProperties: false,
          },
        },
        summary: { type: "string" },
        recommendation: { type: "string", enum: ["SAFE", "CAUTION", "BLOCKLIST"] },
        analysisTimestamp: { type: "string" },
      },
      required: [
        "agentAddress",
        "overallScore",
        "breakdown",
        "flags",
        "summary",
        "recommendation",
        "analysisTimestamp",
      ],
      additionalProperties: false,
    },
  },
};

// ─── Analysis Function ───────────────────────────────────────────────────────

export async function analyzeAgent(
  client: OpenAI,
  data: AgentTransactionData,
  model?: string,
): Promise<TrustScore> {
  const modelId = model ?? PRIMARY_MODEL;

  const userMessage = `Analyze this ${data.chainId.toUpperCase()} chain agent:

Address: ${data.address}
Chain: ${data.chainId}
Transaction count: ${data.transactions.length}
Token transfer count: ${data.tokenTransfers.length}
Unique contracts called: ${new Set(data.contractCalls.map((c) => c.contract)).size}

Recent transactions (last 20):
${JSON.stringify(data.transactions.slice(-20), null, 2)}

Token transfers (last 20):
${JSON.stringify(data.tokenTransfers.slice(-20), null, 2)}

Contract interactions (last 20):
${JSON.stringify(data.contractCalls.slice(-20), null, 2)}`;

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userMessage },
  ];

  let parsed: Record<string, unknown>;

  try {
    // Primary: structured output with json_schema
    const response = await client.chat.completions.create({
      model: modelId,
      messages,
      response_format: TRUST_SCORE_SCHEMA,
      temperature: 0.1,
      max_tokens: 2000,
      // @ts-expect-error venice_parameters not in OpenAI types
      venice_parameters: {
        enable_e2ee: true,
        include_venice_system_prompt: false,
      } satisfies VeniceParameters,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response from Venice");
    parsed = JSON.parse(content);
  } catch (primaryErr) {
    // Fallback: Venice may reject json_schema mode for some models, or return non-JSON.
    // Retry WITHOUT response_format, relying on system prompt "respond ONLY with valid JSON".
    console.warn("Venice structured output failed, retrying without schema:", primaryErr);
    const fallback = await client.chat.completions.create({
      model: modelId,
      messages,
      temperature: 0.1,
      max_tokens: 2000,
      // @ts-expect-error venice_parameters not in OpenAI types
      venice_parameters: {
        enable_e2ee: true,
        include_venice_system_prompt: false,
      } satisfies VeniceParameters,
    });
    const raw = fallback.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty fallback response from Venice");
    parsed = JSON.parse(raw); // If this also fails, let it throw
  }

  return {
    ...parsed,
    chainId: data.chainId,
  } as TrustScore;
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
  };
}
