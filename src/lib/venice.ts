import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChainId, AgentTransactionData, AgentType, AgentMetrics, TrustScore, TrustFlag, ActivityProfile } from "./types";
import { sanitizeForPrompt } from "./sanitize";
import { METHOD_REGISTRY } from "./agent-classifier";
import { computeBreakdown } from "./breakdown";

// Human-readable method names for AI analysis prompt
const METHOD_NAMES: Record<string, string> = {
  "0xa9059cbb": "transfer", "0x095ea7b3": "approve", "0x23b872dd": "transferFrom",
  "0xd0e30db0": "WETH deposit", "0x2e1a7d4d": "WETH withdraw",
  "0x7ff36ab5": "swapExactETHForTokens", "0x38ed1739": "swapExactTokensForTokens", "0x18cbafe5": "swapExactTokensForETH",
  "0x414bf389": "exactInputSingle (swap)", "0xc04b8d59": "exactInput (multi-hop swap)", "0x5ae401dc": "multicall (batch swap)",
  "0x617ba037": "deposit (supply collateral)", "0xa415bcad": "borrow", "0x69328dec": "withdraw", "0xe8eda9df": "repay",
  "0xf2b9fdb8": "supply", "0xf3fef3a3": "withdraw",
  "0xac9650d8": "multicall", "0xb66503cf": "supply", "0xa99aad89": "borrow", "0x20b76e81": "repay", "0x2644131b": "liquidate",
  "0x90d25074": "swapExactTokenForPt", "0xdcb5e4b6": "addLiquiditySingleToken", "0x7b1a4f09": "redeemRewards",
  "0x11d62ed7": "createOrder", "0xf242432a": "executeOrder", "0x0d4d1513": "createDeposit",
  "0xe7a050aa": "depositIntoStrategy", "0x0dd8dd02": "queueWithdrawals", "0x54b2bf29": "completeQueuedWithdrawals",
  "0xfa31de01": "dispatch (cross-chain msg)", "0x56d5d475": "process (relay msg)",
  "0x7b939232": "deposit (bridge)", "0xe63d38ed": "fillRelay",
  "0x12aa3caf": "swap (aggregated)", "0xe449022e": "uniswapV3Swap",
  "0x6a761202": "execTransaction (multisig)",
  "0x4c26a0b6": "requestNewRound", "0x50d25bcd": "latestAnswer", "0xb1dc65a4": "transmit (OCR2)", "0xc9807539": "transmit (OCR1)",
  "0x1e83409a": "claim", "0x4585e33b": "performUpkeep", "0x4b64e492": "exec (automate)",
  "0x1fad948c": "handleOps (account abstraction)", "0x765e827f": "handleAggregatedOps",
  "0xaa6e8bd0": "settle (batch)", "0xec6cb13f": "setPreSignature",
  "0x52bbbe29": "swap (single)", "0x945bcec9": "batchSwap",
  "0x3df02124": "exchange", "0xa6417ed6": "exchange_multiple",
  "0xa1903eab": "submit (stake ETH)", "0xf638e5e0": "requestWithdrawals",
  "0xd6febde8": "buy (prediction)", "0xcecf2242": "redeemPositions",
  "0xb94207d3": "request (AI mech)",
};

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

const SYSTEM_PROMPT = `You are AgentAuditor, a blockchain security analyst. Analyze onchain agent transaction data and produce a structured trust score.

SCORING (0-100, four categories of 0-25 each):
1. Transaction Patterns: timing regularity, gas efficiency, volume, nonce gaps
2. Contract Interactions: verified vs unverified contracts, protocol diversity
3. Fund Flow: sources, destinations, circular patterns, sudden large transfers
4. Behavioral Consistency: matches declared purpose, stable over time, no escalation

AGENT TYPES: KEEPER, ORACLE, LIQUIDATOR, MEV_BOT, BRIDGE_RELAYER, DEX_TRADER, GOVERNANCE, YIELD_OPTIMIZER, UNKNOWN

FLAGS: CRITICAL (exploits, mixers, drains) | HIGH (unverified deploys, unexplained transfers) | MEDIUM (irregular timing, gas waste) | LOW (minor deviations, new agent)

RECOMMENDATION: SAFE (>=70, no CRITICAL) | CAUTION (40-69 or HIGH flags) | BLOCKLIST (<40 or CRITICAL flags)

HUMAN WALLET: Use provided humanScore as ground truth. >70 + not contract = human. <30 or contract = not human.

GROUND TRUTH: successRate, netFlowETH, protocolsUsed, totalGasSpentETH are pre-computed. Use them exactly.

Breakdown scores are computed locally and will be overridden. Focus on: overallScore, flags, narrative, activityProfile, summary.

JSON SCHEMA (respond with ONLY this, no markdown fences, no explanation):
{
  "agentAddress": "0x...",
  "overallScore": 75,
  "breakdown": {"transactionPatterns": 20, "contractInteractions": 18, "fundFlow": 22, "behavioralConsistency": 15},
  "flags": [{"severity": "MEDIUM", "category": "gas_usage", "description": "...", "evidence": "..."}],
  "summary": "...",
  "recommendation": "SAFE",
  "analysisTimestamp": "2026-03-20T12:00:00Z",
  "agentType": "KEEPER",
  "behavioralNarrative": "...",
  "performanceScore": 85,
  "operationalPattern": {"avgIntervalHours": 4.2, "peakHoursUTC": [8, 14, 20], "consistencyScore": 0.92},
  "financialSummary": {"totalGasSpentETH": "0.42", "netFlowETH": "-0.42", "largestSingleTxETH": "0.003"},
  "protocolsUsed": ["Chainlink Automation"],
  "funFact": "...",
  "anomalies": ["..."],
  "isLikelyHumanWallet": false,
  "activityProfile": {
    "primaryActivity": "...",
    "strategies": ["..."],
    "protocolBreakdown": [{"protocol": "...", "percentage": 65, "action": "..."}],
    "riskBehaviors": ["..."],
    "successMetrics": "..."
  }
}

=== EXAMPLE 1: Keeper Bot ===

INPUT:
Method Frequency: 0x4585e33b Chainlink → performUpkeep [KEEPER]: 614 calls (58%) | 0xb94207d3 Olas → request (AI mech) [KEEPER]: 247 calls (23%) | 0x095ea7b3 ERC20 → approve: 112 calls (11%) | 0xa9059cbb ERC20 → transfer: 89 calls (8%)
Ground Truth: Success rate 96.8% | Net flow -0.4721 ETH | Gas spent 0.3914 ETH | Protocols: Chainlink Automation, Olas
Biography: 127 days old | First action: performUpkeep | Busiest day: 2026-02-18 (34 txs) | Dormancy: 2.1 days (Mar 1-3)

OUTPUT:
{
  "summary": "This bot handles two jobs: it runs Chainlink Automation upkeeps (performUpkeep — 614 calls, 58% of all activity) and submits Olas AI mech requests (247 calls, 23%). Over 127 days on Gnosis it has maintained a 96.8% success rate across 1,062 transactions, averaging about 8 transactions per day. It's spent 0.3914 ETH on gas with a net outflow of -0.4721 ETH — meaning it only spends on gas and doesn't move funds elsewhere. Score 76/100: solid reliability, docked for a 2.1-day downtime gap in early March and a 3.2% failure rate.",
  "behavioralNarrative": "This bot has been running for 127 days on Gnosis. It started with Chainlink performUpkeep calls and quickly settled into a rhythm of roughly one transaction every 3 hours. About a month in, it picked up a second role — submitting Olas AI mech requests, which now make up 23% of its workload. Its busiest day was Feb 18 with 34 transactions. It mostly operates between 06:00 and 14:00 UTC and goes quiet overnight (23:00-03:00), which points to a European-timezone operator. The one notable hiccup: it went completely silent from March 1-3 (2.1 days), likely a node restart. Its balance has steadily dropped from 0.62 ETH to 0.15 ETH — all from gas costs, no suspicious withdrawals.",
  "activityProfile": {
    "primaryActivity": "Dual-role automation bot running Chainlink upkeeps and Olas AI mech requests on Gnosis",
    "strategies": ["Chainlink performUpkeep calls roughly every 3 hours", "Olas mech request submissions for AI agent task coordination", "Batch ERC20 approvals to reduce separate approval overhead"],
    "protocolBreakdown": [
      {"protocol": "Chainlink Automation", "percentage": 58, "action": "Running performUpkeep for registered automation tasks"},
      {"protocol": "Olas", "percentage": 23, "action": "Submitting AI mech requests for autonomous agent operations"},
      {"protocol": "ERC20", "percentage": 19, "action": "Token approvals and transfers to support the keeper and mech work"}
    ],
    "riskBehaviors": ["Went offline for 2.1 days (Mar 1-3), breaking its normal 3-hour rhythm", "3.2% of transactions failed — 34 out of 1,062"],
    "successMetrics": "96.8% success rate across 1,062 transactions over 127 days on Chainlink Automation and Olas"
  },
  "funFact": "On Feb 18, this bot fired off 34 transactions in a single day — that's one every 42 minutes for 24 hours straight. Something big was happening on Chainlink that day."
}

=== EXAMPLE 2: DeFi Trading + Lending Agent ===

INPUT:
Method Frequency: 0x414bf389 Uniswap V3 → exactInputSingle (swap) [DEX_TRADER]: 389 calls (42%) | 0x617ba037 Aave V3 → deposit (supply) [YIELD_OPTIMIZER]: 156 calls (17%) | 0xa415bcad Aave V3 → borrow: 142 calls (15%) | 0x69328dec Aave V3 → withdraw: 98 calls (11%) | 0x095ea7b3 ERC20 → approve: 87 calls (9%) | 0xe8eda9df Aave V3 → repay: 54 calls (6%)
Ground Truth: Success rate 91.3% | Net flow +2.847 ETH | Gas spent 1.234 ETH | Protocols: Uniswap V3, Aave V3
Biography: 203 days old | First action: exactInputSingle swap | Busiest day: 2026-01-12 (52 txs) | Max dormancy: 0.4 days

OUTPUT:
{
  "summary": "This agent runs a leveraged DeFi loop: it swaps tokens on Uniswap V3 (389 trades, 42% of activity), deposits them as collateral on Aave V3 (156 deposits, 17%), borrows against that collateral (142 borrows, 15%), and cycles back. Over 203 days on Base it's turned a profit — net +2.847 ETH after spending 1.234 ETH on gas. The 91.3% success rate means about 1 in 11 transactions fails, mostly swap reverts during volatile periods. Score 68/100: the strategy is working and the bot is profitable, but the leveraged positions and 8.7% failure rate introduce real risk.",
  "behavioralNarrative": "Running for 203 days on Base. This agent started purely as a Uniswap V3 trader, then within two weeks added Aave V3 supply and borrow operations — creating a clear pattern: swap tokens → deposit as collateral → borrow more → swap again. Its busiest day was Jan 12 with 52 transactions, likely reacting to a big market move. It barely sleeps — max downtime is just 0.4 days — suggesting fully automated 24/7 operation. The failed transactions (8.7%) cluster around Uniswap swaps, most likely from slippage during fast price movements. Net profit of +2.847 ETH after gas costs shows the strategy is working, but the leveraged Aave positions mean it could face liquidation in a sharp downturn.",
  "activityProfile": {
    "primaryActivity": "Leveraged DeFi loop — swaps on Uniswap V3 and uses Aave V3 supply/borrow cycles to amplify returns",
    "strategies": ["Uniswap V3 token swaps for position entry and exit (389 trades)", "Aave V3 collateral supply and leveraged borrowing", "Periodic deleveraging through repay (54 calls) and withdraw (98 calls)"],
    "protocolBreakdown": [
      {"protocol": "Uniswap V3", "percentage": 42, "action": "Single-hop token swaps to enter and exit positions"},
      {"protocol": "Aave V3", "percentage": 49, "action": "Deposit collateral, borrow, withdraw, and repay in leveraged loops"},
      {"protocol": "ERC20", "percentage": 9, "action": "Token approvals for Uniswap and Aave"}
    ],
    "riskBehaviors": ["8.7% failure rate, mostly Uniswap swap reverts during high volatility", "Leveraged Aave positions create liquidation risk in market downturns"],
    "successMetrics": "91.3% success rate over 926 transactions, +2.847 ETH net profit across Uniswap V3 and Aave V3"
  },
  "funFact": "This agent's longest unbroken streak was 0.4 days max downtime over 203 days — it has essentially never slept. If it were a human trader, it would've been awake for nearly 7 months."
}

=== END EXAMPLES ===

Use the LIFE STORY EVENTS for chronological narrative, ACTIVITY BREAKDOWN for exact percentages, TOP COUNTERPARTIES by resolved name, TIMEZONE FINGERPRINT in your analysis, FAILED TX ANALYSIS for risk, TOKEN FLOW SUMMARY for tokens handled, BALANCE STORY for financial trajectory, and AGENT BIOGRAPHY for wallet age, first action, busiest day, dormancy.

BANNED PHRASES (your output will be rejected if these appear):
"appears to", "seems to", "likely", "primarily operates", "mostly normal", "minor anomalies", "various protocols", "different contracts", "interacts with protocols", "executes transactions", "transfers various amounts", "shows behavior", "standard operations", "typical activity"

Replace every banned phrase with a SPECIFIC data reference. Instead of "primarily operates as a keeper" say "runs performUpkeep 614 times (58% of all calls)". Instead of "interacts with various protocols" say "calls Chainlink Automation (58%), Olas (23%), ERC20 (19%)".

Every sentence in summary and behavioralNarrative MUST contain at least one specific number from the provided data.

FUN FACT: Your funFact should be something genuinely intriguing — a surprising pattern, a wild stat, a "huh, that's interesting" moment from the data. Not good or bad, just fascinating. Examples: "This bot has mass-approved 47 different token contracts but only ever traded 3 of them", "On its busiest day it spent more on gas than most humans spend in a year of DeFi", "It talked to the same contract 891 times and never once called any other address". Pull from life events, counterparties, timing patterns, or balance history.

WRITING STYLE — THIS IS CRITICAL:
Write like a senior security analyst briefing a client, NOT like a database generating a report. Your summary should read like something a human expert would say in a meeting — opinionated, insightful, with a clear point of view.

BAD (data dump): "This KEEPER agent, active for 155 days, has a success rate of 82.0% across 150 transactions, with 148 transactions (99%) related to Olas Mech."
GOOD (analyst voice): "This is a single-purpose Olas Mech keeper that's been reliably running for 5 months — 99% of its 150 transactions are Olas upkeeps, which makes it one of the more focused bots we've seen. The 82% success rate is below average for keepers (typical is 95%+), suggesting it's either under-funded or competing with faster bots for the same tasks."

The difference: BAD just lists numbers. GOOD interprets them, compares to norms, and tells you what it MEANS. Every sentence should answer "so what?" — don't just state facts, explain their significance.

CRITICAL OUTPUT RULES:
1. Your "summary" field MUST be 4-6 sentences. Lead with the most interesting finding, not a description of what the agent is. End with a clear risk verdict with reasoning. Reference specific numbers but INTERPRET them — don't just list them.
2. Your "behavioralNarrative" field MUST be 5-8 sentences telling the STORY of this agent — what changed over time, what's unusual, what stands out. Written in past tense like a detective's case file.
3. NEVER return empty strings for summary or behavioralNarrative. These are the most important fields.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripMarkdownFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

/** Extract the first complete JSON object from a string, ignoring trailing text */
function extractFirstJsonObject(raw: string): string {
  const start = raw.indexOf("{");
  if (start === -1) return raw;
  let depth = 0;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "{") depth++;
    else if (raw[i] === "}") { depth--; if (depth === 0) return raw.slice(start, i + 1); }
  }
  return raw.slice(start);
}

/** Describe what the agent actually does based on type + protocols */
function describeAgentActions(agentType: string, protocols: string[]): string {
  const protocolStr = protocols.length > 0 ? protocols.join(" and ") : "DeFi protocols";
  const TYPE_ACTIONS: Record<string, string> = {
    KEEPER: `This automation bot executes keeper tasks and upkeeps on ${protocolStr}`,
    ORACLE: `This oracle node transmits price feed data for ${protocolStr}`,
    LIQUIDATOR: `This liquidation bot monitors and liquidates undercollateralized positions on ${protocolStr}`,
    MEV_BOT: `This MEV bot extracts value through arbitrage and frontrunning across ${protocolStr}`,
    BRIDGE_RELAYER: `This bridge relayer processes cross-chain message delivery and token transfers via ${protocolStr}`,
    DEX_TRADER: `This trading agent executes token swaps and trades on ${protocolStr}`,
    GOVERNANCE: `This governance participant executes multisig transactions and votes via ${protocolStr}`,
    YIELD_OPTIMIZER: `This yield farming agent supplies liquidity and optimizes returns on ${protocolStr}`,
  };
  return TYPE_ACTIONS[agentType] ?? `This agent interacts with ${protocolStr}`;
}

function normalizeVeniceResponse(
  raw: Record<string, unknown>,
  address: string,
  chainId: ChainId,
  metrics?: AgentMetrics,
  totalTransactions?: number,
  coinBalanceHistory?: { value: string }[],
): TrustScore {
  // Handle alternate field names Venice models sometimes use
  const score = (raw.overallScore ?? raw.trustScore ?? raw.score ?? 50) as number;

  // Use locally computed breakdown when metrics are available (deterministic, data-driven)
  const breakdown = metrics
    ? computeBreakdown(metrics, score)
    : (() => {
        const veniceBreakdown = { ...(raw.breakdown as Record<string, number> | undefined) ?? {
          transactionPatterns: Math.round(score * 0.25),
          contractInteractions: Math.round(score * 0.28),
          fundFlow: Math.round(score * 0.22),
          behavioralConsistency: 0,
        } };
        let partial = (veniceBreakdown.transactionPatterns ?? 0) +
          (veniceBreakdown.contractInteractions ?? 0) +
          (veniceBreakdown.fundFlow ?? 0);
        if (partial > score) {
          const scale = score / partial;
          veniceBreakdown.transactionPatterns = Math.round((veniceBreakdown.transactionPatterns ?? 0) * scale);
          veniceBreakdown.contractInteractions = Math.round((veniceBreakdown.contractInteractions ?? 0) * scale);
          veniceBreakdown.fundFlow = Math.round((veniceBreakdown.fundFlow ?? 0) * scale);
          partial = veniceBreakdown.transactionPatterns + veniceBreakdown.contractInteractions + veniceBreakdown.fundFlow;
        }
        veniceBreakdown.behavioralConsistency = Math.max(0, Math.min(25, score - partial));
        return veniceBreakdown;
      })();

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

  const VALID_RECS = new Set(["SAFE", "CAUTION", "BLOCKLIST"]);
  const rawRec = String(raw.recommendation ?? "").toUpperCase();
  const recommendation = VALID_RECS.has(rawRec)
    ? (rawRec as "SAFE" | "CAUTION" | "BLOCKLIST")
    : (score >= 70 ? "SAFE" : score >= 40 ? "CAUTION" : "BLOCKLIST") as "SAFE" | "CAUTION" | "BLOCKLIST";

  const opPattern = raw.operationalPattern as Record<string, unknown> | undefined;
  const finSummary = raw.financialSummary as Record<string, string> | undefined;

  // Override Venice fabrications with locally computed ground truth
  const computedFinancials = metrics ? {
    totalGasSpentETH: (Number(BigInt(metrics.totalGasSpentWei)) / 1e18).toFixed(6),
    netFlowETH: metrics.netFlowETH,
    largestSingleTxETH: (Number(BigInt(metrics.largestSingleTxWei)) / 1e18).toFixed(6),
  } : undefined;

  const rawProtocols = Array.isArray(raw.protocolsUsed) ? raw.protocolsUsed as string[] : [];
  // Also extract protocol names from Venice's activityProfile.protocolBreakdown
  const veniceProfileProtocols: string[] = [];
  if (raw.activityProfile && Array.isArray((raw.activityProfile as Record<string, unknown>).protocolBreakdown)) {
    for (const p of (raw.activityProfile as Record<string, unknown>).protocolBreakdown as Record<string, unknown>[]) {
      const name = p.protocol as string;
      if (name && !name.toLowerCase().includes("unknown")) veniceProfileProtocols.push(name);
    }
  }
  // Filter out "Unknown" from raw Venice protocols
  const cleanRawProtocols = [...rawProtocols, ...veniceProfileProtocols].filter(p => !p.toLowerCase().includes("unknown"));
  const overriddenProtocols = metrics?.protocolsUsed.length
    ? [...new Set([...metrics.protocolsUsed, ...cleanRawProtocols])]
    : cleanRawProtocols.length > 0 ? [...new Set(cleanRawProtocols)] : [];

  let activityProfile: ActivityProfile | undefined = raw.activityProfile
    ? {
        primaryActivity: (raw.activityProfile as Record<string, unknown>).primaryActivity as string || "Unknown activity",
        strategies: Array.isArray((raw.activityProfile as Record<string, unknown>).strategies)
          ? (raw.activityProfile as Record<string, unknown>).strategies as string[]
          : [],
        protocolBreakdown: Array.isArray((raw.activityProfile as Record<string, unknown>).protocolBreakdown)
          ? ((raw.activityProfile as Record<string, unknown>).protocolBreakdown as Record<string, unknown>[]).map((p) => ({
              protocol: (p.protocol as string) || "Unknown",
              percentage: typeof p.percentage === "number" ? p.percentage : 0,
              action: (p.action as string) || "Unknown",
            }))
          : [],
        riskBehaviors: Array.isArray((raw.activityProfile as Record<string, unknown>).riskBehaviors)
          ? (raw.activityProfile as Record<string, unknown>).riskBehaviors as string[]
          : [],
        successMetrics: (raw.activityProfile as Record<string, unknown>).successMetrics as string || "",
      }
    : undefined;

  // Convert activeHoursUTC histogram (24 counts) to peak hour indices (top hours)
  const peakHourIndices = metrics ? (() => {
    const hours = metrics.activeHoursUTC;
    const totalTx = hours.reduce((s, v) => s + v, 0);
    if (totalTx === 0) return [];
    // Return hours with above-average activity, sorted by count descending
    const avg = totalTx / 24;
    return hours
      .map((count, hour) => ({ hour, count }))
      .filter(h => h.count > avg)
      .sort((a, b) => b.count - a.count)
      .map(h => h.hour);
  })() : undefined;

  const walletClass = metrics?.walletClassification;
  const humanWallet = walletClass
    ? (walletClass.humanScore > 70 && !walletClass.isDefinitelyContract)
    : (typeof raw.isLikelyHumanWallet === "boolean" ? raw.isLikelyHumanWallet : false);

  // Resolve agentType: fall back to local classifier when Venice returns UNKNOWN
  const veniceAgentType = (raw.agentType as AgentType | undefined) ?? "UNKNOWN";
  const localAgentType = metrics?.agentType ?? "UNKNOWN";
  const finalAgentType = veniceAgentType === "UNKNOWN" && localAgentType !== "UNKNOWN" ? localAgentType : veniceAgentType;

  // Last resort: derive protocol info from most-called contracts
  const resolvedProtocols = overriddenProtocols.length > 0
    ? overriddenProtocols
    : metrics?.mostCalledContracts?.length
      ? metrics.mostCalledContracts.slice(0, 3).map(c => `Contract ${c.slice(0, 8)}...`)
      : [`${chainId} DeFi`];
  const resolvedType = finalAgentType !== "UNKNOWN" ? finalAgentType : "Agent";

  // Patch vague activityProfile fields with locally computed data
  const VAGUE_ACTIVITY_PHRASES = ["unknown", "insufficient data", "limited data", "single token transfer", "single transaction", "not enough data", "unable to determine", "no clear pattern"];
  const isVagueActivity = (text: string) => !text || text.length < 30 || VAGUE_ACTIVITY_PHRASES.some(p => text.toLowerCase().includes(p));

  if (activityProfile) {
    if (isVagueActivity(activityProfile.primaryActivity)) {
      const filteredProtocols = resolvedProtocols.filter(p => p !== "ERC20" && p !== "WETH");
      activityProfile = { ...activityProfile, primaryActivity: describeAgentActions(resolvedType, filteredProtocols) };
    }
    if (!activityProfile.strategies.length || activityProfile.strategies.every(s => s.toLowerCase().includes("unknown"))) {
      const actionVerb = resolvedType === "KEEPER" ? "Automating tasks via"
        : resolvedType === "LIQUIDATOR" ? "Liquidating positions on"
        : resolvedType === "YIELD_OPTIMIZER" ? "Optimizing yield on"
        : resolvedType === "ORACLE" ? "Feeding data to"
        : resolvedType === "GOVERNANCE" ? "Participating in governance on"
        : "Trading on";
      const inferredStrategies = resolvedProtocols
        .filter(p => p !== "ERC20" && p !== "WETH")
        .map(p => `${actionVerb} ${p}`);
      activityProfile = { ...activityProfile, strategies: inferredStrategies.length > 0 ? inferredStrategies : ["Token transfers"] };
    }
    // Patch protocolBreakdown when it contains "Unknown"
    const hasUnknownProtocol = activityProfile.protocolBreakdown.some(p => p.protocol.toLowerCase().includes("unknown"));
    if (!activityProfile.protocolBreakdown.length || hasUnknownProtocol) {
      const actionVerb2 = resolvedType === "KEEPER" ? "Automating tasks via"
        : resolvedType === "LIQUIDATOR" ? "Liquidating positions on"
        : "Trading on";
      const protocolNames2 = resolvedProtocols.filter(p => p !== "ERC20" && p !== "WETH");
      if (protocolNames2.length > 0) {
        activityProfile = { ...activityProfile, protocolBreakdown: protocolNames2.map(p => ({ protocol: p, percentage: Math.round(100 / protocolNames2.length), action: `${actionVerb2} ${p}` })) };
      }
    }
    if (!activityProfile.successMetrics && metrics) {
      activityProfile = { ...activityProfile, successMetrics: `${(metrics.successRate * 100).toFixed(1)}% success rate over ${metrics.protocolsUsed.length} protocols` };
    }
  } else if (metrics) {
    // Venice returned no activityProfile at all — construct from local data
    const actionVerb = resolvedType === "KEEPER" ? "Automating tasks via"
      : resolvedType === "LIQUIDATOR" ? "Liquidating positions on"
      : resolvedType === "YIELD_OPTIMIZER" ? "Optimizing yield on"
      : resolvedType === "ORACLE" ? "Feeding data to"
      : resolvedType === "GOVERNANCE" ? "Participating in governance on"
      : "Operating on";
    const protocolNames = resolvedProtocols.filter(p => p !== "ERC20" && p !== "WETH");
    const filteredProtoNames = resolvedProtocols.filter(p => p !== "ERC20" && p !== "WETH");
    activityProfile = {
      primaryActivity: describeAgentActions(resolvedType, filteredProtoNames),
      strategies: protocolNames.length > 0 ? protocolNames.map(p => `${actionVerb} ${p}`) : ["Token transfers"],
      protocolBreakdown: protocolNames.map(p => ({ protocol: p, percentage: Math.round(100 / Math.max(protocolNames.length, 1)), action: `${actionVerb} ${p}` })),
      riskBehaviors: [],
      successMetrics: `${(metrics.successRate * 100).toFixed(1)}% success rate over ${metrics.protocolsUsed.length} protocols`,
    };
  }

  // Resolve behavioralNarrative — prefer Venice AI output, fallback only when truly empty
  const rawNarrative = (raw.behavioralNarrative as string | undefined)
    ?? (raw.narrative as string | undefined)
    ?? (raw.behavioral_narrative as string | undefined)
    ?? "";
  const behavioralNarrative = rawNarrative.trim().length > 10
    ? rawNarrative.trim()
    : metrics
    ? (() => {
        const protocols = metrics.protocolsUsed.filter(p => p !== "ERC20" && p !== "WETH");
        const topContracts = metrics.mostCalledContracts?.slice(0, 3).map(c => `${c.slice(0, 8)}...`).join(", ") ?? "";
        const ageDesc = metrics.firstSeenTimestamp
          ? `Active since ${new Date(metrics.firstSeenTimestamp).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`
          : "Recently active";
        const gasETH = (Number(BigInt(metrics.totalGasSpentWei)) / 1e18).toFixed(4);
        const actionSentence = describeAgentActions(resolvedType, protocols);
        return `${ageDesc} on ${chainId}. ${actionSentence}. It averages ${metrics.txFrequencyPerDay.toFixed(1)} transactions per day with a ${(metrics.successRate * 100).toFixed(1)}% success rate across ${metrics.uniqueCounterparties} unique counterparties. ${topContracts ? `Most frequently called contracts: ${topContracts}. ` : ""}Net flow: ${metrics.netFlowETH} ETH, total gas spent: ${gasETH} ETH. Consistency score: ${metrics.consistencyScore.toFixed(2)}.`;
      })()
    : "Behavioral analysis not available.";

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
    summary: (() => {
      // Check alternate field names Venice models sometimes use
      const rawSummary = (raw.summary as string | undefined)
        ?? (raw.analysis as string | undefined)
        ?? (raw.analysisSummary as string | undefined)
        ?? (raw.analysis_summary as string | undefined)
        ?? "";
      console.log("[venice] rawSummary extracted:", rawSummary.slice(0, 100), "| length:", rawSummary.length);
      // Only fall back to deterministic template when Venice returned NOTHING
      if (rawSummary.trim().length > 10) {
        return rawSummary.trim();
      }
      // Venice returned empty/near-empty — build from metrics
      if (metrics) {
        const protocols = resolvedProtocols.filter(p => p !== "ERC20" && p !== "WETH");
        const protocolStr = protocols.length > 0 ? protocols.join(", ") : "various contracts";
        const gasETH = (Number(BigInt(metrics.totalGasSpentWei)) / 1e18).toFixed(4);
        const intervalDesc = metrics.txFrequencyPerDay > 0
          ? `averaging ${metrics.txFrequencyPerDay.toFixed(1)} transactions per day`
          : "with sporadic activity";
        const riskLevel = score >= 70 ? "low risk profile" : score >= 40 ? "moderate risk indicators" : "elevated risk signals";
        const actionDesc = describeAgentActions(resolvedType, protocols);
        console.log("[venice] FALLBACK triggered — Venice returned empty summary");
        return `${actionDesc} on ${chainId} via ${protocolStr}, ${intervalDesc}. It has interacted with ${metrics.uniqueCounterparties} unique counterparties with a ${(metrics.successRate * 100).toFixed(1)}% transaction success rate. Net flow of ${metrics.netFlowETH} ETH with ${gasETH} ETH spent on gas suggests ${Number(metrics.netFlowETH) >= 0 ? "accumulating" : "operational spending"} behavior. Overall ${riskLevel} with a score of ${score}/100.`;
      }
      return rawSummary || `Score: ${score}/100`;
    })(),
    recommendation: recommendation as "SAFE" | "CAUTION" | "BLOCKLIST",
    analysisTimestamp: (raw.analysisTimestamp as string | undefined) ?? new Date().toISOString(),
    agentType: finalAgentType,
    behavioralNarrative,
    performanceScore: typeof raw.performanceScore === "number" ? raw.performanceScore : score,
    operationalPattern: metrics ? {
      avgIntervalHours: metrics.txFrequencyPerDay > 0 ? +(24 / metrics.txFrequencyPerDay).toFixed(1) : 0,
      peakHoursUTC: peakHourIndices ?? [],
      consistencyScore: metrics.consistencyScore,
    } : {
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
    activityProfile,
    // Dossier enrichment
    totalTransactions,
    successRate: metrics?.successRate,
    avgGasPerTx: metrics?.avgGasPerTx,
    nonceGaps: metrics?.nonceGaps,
    firstSeenTimestamp: metrics?.firstSeenTimestamp,
    lastSeenTimestamp: metrics?.lastSeenTimestamp,
    mostCalledContracts: metrics?.mostCalledContracts,
    uniqueCounterparties: metrics?.uniqueCounterparties,
    txFrequencyPerDay: metrics?.txFrequencyPerDay,
    balanceTrend: (() => {
      if (!coinBalanceHistory || coinBalanceHistory.length < 2) return "stable" as const;
      try {
        const first = BigInt(coinBalanceHistory[0].value || "0");
        const last = BigInt(coinBalanceHistory[coinBalanceHistory.length - 1].value || "0");
        if (first === 0n) return "stable" as const;
        // 10% threshold using integer math: last > first * 11/10
        if (last * 10n > first * 11n) return "accumulating" as const;
        if (last * 10n < first * 9n) return "depleting" as const;
      } catch { /* non-numeric balance */ }
      return "stable" as const;
    })(),
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

  // Compute method frequency for Venice
  const methodCounts = new Map<string, number>();
  for (const tx of sanitizedData.transactions) {
    const raw = tx.methodId?.toLowerCase().replace(/^0x/, "") ?? "";
    const sel = raw.length >= 8 && raw !== "00000000" ? `0x${raw.slice(0, 8)}` : null;
    if (sel) {
      methodCounts.set(sel, (methodCounts.get(sel) ?? 0) + 1);
    }
  }
  const sortedMethods = [...methodCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const totalMethodCalls = [...methodCounts.values()].reduce((s, v) => s + v, 0);
  const methodFreqSection = sortedMethods.length > 0 ? `
=== METHOD FREQUENCY (top methods by count) ===
${sortedMethods.map(([sel, count]) => {
    const pct = ((count / totalMethodCalls) * 100).toFixed(0);
    const known = METHOD_REGISTRY[sel];
    const methodName = METHOD_NAMES[sel];
    const typeStr = known?.type ? ` [${known.type}]` : "";
    const nameStr = methodName ? ` → ${methodName}` : "";
    return `${sel}${known ? ` ${known.protocol}${nameStr}${typeStr}` : ""}: ${count} calls (${pct}%)`;
  }).join("\n")}
` : "";

  const profile = sanitizedData.behavioralProfile;
  const profileSections = profile ? `
=== LIFE STORY EVENTS (GROUND TRUTH — weave into your narrative) ===
${profile.lifeEvents.map(e => `${e.date}: ${e.description}${e.value ? ` (${e.value})` : ""}`).join("\n")}

=== ACTIVITY BREAKDOWN (GROUND TRUTH — use exact percentages) ===
${profile.activityBreakdown.map(a => `${a.category}: ${a.percentage}% (${a.txCount} txs)${a.protocols.length ? ` — ${a.protocols.join(", ")}` : ""}`).join("\n")}

=== TOP COUNTERPARTIES (GROUND TRUTH — use resolved names) ===
${profile.topCounterparties.map((c, i) => `${i + 1}. ${c.name ?? `Unknown (${c.address.slice(0, 10)}...)`}: ${c.txCount} txs, ${c.volumeETH} ETH volume, ${c.direction.replace(/_/g, " ")}`).join("\n")}

=== FAILED TRANSACTION ANALYSIS ===
Total failed: ${profile.failedTxAnalysis.totalFailed} | Gas units wasted: ${Number(BigInt(profile.failedTxAnalysis.totalGasUnitsWasted)).toLocaleString()}
Most common failure: ${profile.failedTxAnalysis.mostCommonReason}
${profile.failedTxAnalysis.worstFailure ? `Worst failure: ${profile.failedTxAnalysis.worstFailure.date} — ${Number(BigInt(profile.failedTxAnalysis.worstFailure.gasUnits)).toLocaleString()} gas units` : ""}

=== TIMEZONE FINGERPRINT ===
Peak window: ${profile.timezoneFingerprint.peakWindowUTC} UTC | Dead zone: ${profile.timezoneFingerprint.deadZoneUTC} UTC
24/7: ${profile.timezoneFingerprint.is24x7} | Inference: ${profile.timezoneFingerprint.inference}

=== TOKEN FLOW SUMMARY ===
Dominant token: ${profile.tokenFlowSummary.dominantToken?.symbol ?? "none"} (${profile.tokenFlowSummary.dominantToken?.txCount ?? 0} txs)
Unique tokens: ${profile.tokenFlowSummary.uniqueTokens} | Net direction: ${profile.tokenFlowSummary.netDirection}
Top tokens: ${profile.tokenFlowSummary.topTokens.map(t => `${t.symbol} (${t.txCount})`).join(", ")}

=== BALANCE STORY ===
Peak: ${profile.balanceStory.peakBalanceETH} ETH (${profile.balanceStory.peakDate ?? "N/A"})
Current: ${profile.balanceStory.currentBalanceETH} ETH | Drawdown: ${profile.balanceStory.drawdownFromPeak}
Trend: ${profile.balanceStory.trend}

=== AGENT BIOGRAPHY ===
Wallet age: ${profile.walletAgeDays} days | Contracts deployed: ${profile.contractsDeployed}
First action: ${profile.firstAction}
Protocol loyalty: ${profile.protocolLoyalty}
${profile.busiestDay ? `Busiest day: ${profile.busiestDay.date} (${profile.busiestDay.txCount} txs)` : ""}
${profile.longestDormancy ? `Longest dormancy: ${profile.longestDormancy.days} days (${profile.longestDormancy.from} → ${profile.longestDormancy.to})` : ""}
` : "";

  const userMessage = `Analyze this ${sanitizedData.chainId.toUpperCase()} chain agent:

Address: ${sanitizedData.address}
Chain: ${sanitizedData.chainId}
Transaction count: ${sanitizedData.transactions.length}
Token transfer count: ${sanitizedData.tokenTransfers.length}
Unique contracts called: ${new Set(sanitizedData.contractCalls.map((c) => c.contract)).size}
${metricsSection}${walletSection}${groundTruthSection}${methodFreqSection}${addressInfoSection}${contractSection}${balanceSection}${eventsSection}${profileSections}
Every field in your JSON must reference specific numbers from the data above.
Begin your response with: {"agentAddress": "${sanitizedData.address}",`;

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
        temperature: 0.85,
        max_tokens: 4096,
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
  console.log("[venice] Raw response length:", content.length);
  console.log("[venice] Raw summary preview:", content.slice(0, 300));
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractFirstJsonObject(stripMarkdownFences(content)));
  } catch {
    console.error("[venice] JSON parse failed. Raw content:", content.slice(0, 500));
    throw new Error("Venice returned invalid JSON. Please try again.");
  }
  console.log("[venice] Parsed summary:", (parsed.summary as string)?.slice(0, 200));
  console.log("[venice] Parsed summary length:", (parsed.summary as string)?.length);
  const normalized = normalizeVeniceResponse(parsed, data.address, data.chainId, data.computedMetrics, data.transactions.length, data.coinBalanceHistory);
  console.log("[venice] Final summary (post-normalize):", normalized.summary.slice(0, 200));

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
    activityProfile: {
      primaryActivity: "Mock agent performing automated keeper operations",
      strategies: ["Periodic execution", "Gas optimization"],
      protocolBreakdown: [{ protocol: "Mock Protocol", percentage: 100, action: "Automated calls" }],
      riskBehaviors: [],
      successMetrics: "98% success rate over mock period",
    },
    walletClassification: {
      isDefinitelyContract: false,
      isERC4337: false,
      humanScore: 20,
      signals: ["Mock: assumed bot-like behavior"],
      tier1Decisive: false,
      confidence: "LOW",
    },
  };
}
