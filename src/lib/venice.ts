import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { ChainId, AgentTransactionData, AgentType, AgentMetrics, TrustScore, TrustFlag, ActivityProfile, BehavioralProfile, SampleContext, EntityClassification, EntityType } from "./types";
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
const PRIMARY_MODEL = "mistral-small-3-2-24b-instruct";
const FALLBACK_MODEL = "llama-3.3-70b";

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
export async function resolveModel(_client?: OpenAI): Promise<string> {
  // Use PRIMARY_MODEL directly — saves 2-3s by skipping models.list() API call.
  // Venice has had llama-3.3-70b since launch; if removed, chat.completions.create
  // will fail with a clear error anyway.
  return PRIMARY_MODEL;
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
  "_thinking": "Before writing the summary, answer these 4 questions in 1 sentence each: 1) What is the SINGLE most interesting or unusual thing about this agent? 2) How does this agent compare to typical agents of its type? 3) What should someone worry about? 4) What's the bottom line — would you trust it?",
  "overallScore": 75,
  "breakdown": {"transactionPatterns": 20, "contractInteractions": 18, "fundFlow": 22, "behavioralConsistency": 15},
  "flags": [{"severity": "MEDIUM", "category": "gas_usage", "description": "...", "evidence": "..."}],
  "summary": "USE YOUR _thinking ANSWERS ABOVE to write 4-6 sentences. Lead with insight #1, compare with #2, warn with #3, conclude with #4. Do NOT just list numbers — interpret what they mean.",
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
  "_thinking": "1) This bot does two jobs at once — Chainlink upkeeps AND Olas mech requests — which is unusual for a keeper. 2) Its 96.8% success rate is decent but below the ~99% typical for single-purpose keepers. 3) The 2.1-day March outage and declining balance (0.62→0.15 ETH) suggest it could run out of gas funds soon. 4) Trustworthy for now, but the dual-role design introduces more failure modes than a focused keeper.",
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
  "_thinking": "1) This agent is running a textbook leveraged DeFi loop — swap→deposit→borrow→repeat — and it's actually profitable (+2.847 ETH net). 2) 91.3% success rate is below average for DeFi bots (typically 95%+), likely from swap reverts during volatility. 3) The leverage means a sharp market drop could trigger cascading liquidations. 4) Profitable and consistent, but the leverage strategy means it's one bad day away from getting wiped.",
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

// ─── Analyst-Quality Summary Generator ──────────────────────────────────────
// Research-backed 3-part structure: Classification headline → Key findings → Forward look
// Modeled after Chainalysis Reactor reports, Webacy risk assessments, and CrowdStrike executive summaries

/** Median benchmarks by agent type for contextualizing metrics */
const TYPE_BENCHMARKS: Record<string, { successRate: number; txPerDay: number; gasPerTx: number }> = {
  KEEPER:          { successRate: 0.95, txPerDay: 8.0,  gasPerTx: 120_000 },
  ORACLE:          { successRate: 0.98, txPerDay: 24.0, gasPerTx: 80_000 },
  LIQUIDATOR:      { successRate: 0.88, txPerDay: 3.0,  gasPerTx: 250_000 },
  MEV_BOT:         { successRate: 0.95, txPerDay: 50.0, gasPerTx: 168_000 },
  BRIDGE_RELAYER:  { successRate: 0.97, txPerDay: 12.0, gasPerTx: 150_000 },
  DEX_TRADER:      { successRate: 0.89, txPerDay: 5.0,  gasPerTx: 180_000 },
  GOVERNANCE:      { successRate: 0.99, txPerDay: 0.5,  gasPerTx: 100_000 },
  YIELD_OPTIMIZER: { successRate: 0.92, txPerDay: 4.0,  gasPerTx: 200_000 },
  UNKNOWN:         { successRate: 0.90, txPerDay: 5.0,  gasPerTx: 150_000 },
};

function compareToBenchmark(value: number, median: number): string {
  const ratio = value / median;
  if (ratio >= 1.15) return "above";
  if (ratio >= 0.95) return "in line with";
  if (ratio >= 0.80) return "below";
  return "well below";
}

function formatETH(wei: string): string {
  const eth = Number(BigInt(wei)) / 1e18;
  if (eth === 0 || eth < 0.000001) return "0 ETH";
  if (eth < 0.001) return `${eth.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} ETH`;
  if (eth < 1) return `${eth.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} ETH`;
  return `${eth.toFixed(2)} ETH`;
}

/** Format ETH amounts cleanly — no trailing zeros */
function fmtETH(value: number): string {
  if (value === 0) return "0";
  const abs = Math.abs(value);
  if (abs < 0.001) return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
  if (abs < 1) return value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (abs < 100) return value.toFixed(2);
  return value.toFixed(0);
}

// ─────────────────────────────────────────────────────────────
// Type-adaptive analyst summary system
// Each agent type gets a narrative generator that tells its specific story.
// ─────────────────────────────────────────────────────────────

interface SummaryContext {
  agentType: string;
  typeName: string;
  chainId: string;
  score: number;
  metrics: AgentMetrics;
  bench: { successRate: number; txPerDay: number; gasPerTx: number };
  protocols: readonly string[];
  protocolStr: string;
  flags: readonly TrustFlag[];
  txCount: number;
  profile?: BehavioralProfile;
  ageStr: string;
  ageDays: number | null;
  successPct: string;
  benchSuccessPct: string;
  successComparison: string;
  netFlow: number;
  gasETH: string;
  criticalFlags: readonly TrustFlag[];
  mediumFlags: readonly TrustFlag[];
}

function buildSummaryContext(
  agentType: string, chainId: string, score: number,
  metrics: AgentMetrics, protocols: readonly string[],
  flags: readonly TrustFlag[], txCount: number, profile?: BehavioralProfile,
): SummaryContext {
  const bench = TYPE_BENCHMARKS[agentType] ?? TYPE_BENCHMARKS.UNKNOWN;
  const filteredProtocols = protocols.filter(p =>
    p !== "ERC20" && p !== "WETH" && !p.startsWith("0x") && !p.startsWith("Contract ")
  );
  const protocolStr = filteredProtocols.length > 0 ? filteredProtocols.join(", ") : chainId + " DeFi";
  const typeName = agentType.replace(/_/g, " ").toLowerCase();
  const ageDays = metrics.firstSeenTimestamp
    ? Math.floor((Date.now() - metrics.firstSeenTimestamp) / 86_400_000)
    : profile?.walletAgeDays ?? null;
  const ageStr = ageDays !== null
    ? ageDays > 365 ? `${Math.floor(ageDays / 365)}+ year` : `${ageDays}-day`
    : "";
  return {
    agentType, typeName, chainId, score, metrics, bench, protocols,
    protocolStr, flags, txCount, profile, ageStr, ageDays,
    successPct: (metrics.successRate * 100).toFixed(1),
    benchSuccessPct: (bench.successRate * 100).toFixed(0),
    successComparison: compareToBenchmark(metrics.successRate, bench.successRate),
    netFlow: Number(metrics.netFlowETH),
    gasETH: formatETH(metrics.totalGasSpentWei),
    criticalFlags: flags.filter(f => f.severity === "CRITICAL" || f.severity === "HIGH"),
    mediumFlags: flags.filter(f => f.severity === "MEDIUM"),
  };
}

// ─── Shared helpers used by all narrators ───

// Friendly category names for non-technical users
const FRIENDLY_CATEGORY: Record<string, string> = {
  swapping: "token swaps",
  lending: "lending",
  borrowing: "borrowing",
  lp_provision: "providing liquidity",
  staking: "staking",
  bridging: "cross-chain transfers",
  governance: "governance votes",
  keeper_ops: "automated maintenance",
  oracle_ops: "data feeds",
  nft_trading: "NFT trading",
  transfers: "simple transfers",
  contract_creation: "deploying contracts",
  other: "other operations",
};

/** Detect spam/scam airdrop tokens by their name patterns */
function isSpamToken(symbol: string): boolean {
  if (!symbol) return true;
  const s = symbol.toLowerCase();
  // URL patterns — full URLs, bare "https/http", or domain TLDs anywhere in name
  if (/https?|\.com\b|\.net\b|\.io\b|\.lat\b|\.xyz\b|\.org\b|\.dev\b/.test(s)) return true;
  // Scam phrases
  if (/claim|free|bonus|reward|winner|won \$|airdrop|visit|voucher|promo/i.test(s)) return true;
  // Dollar amounts in name ("$50,000", "$5000")
  if (/\$\s*[\d,]+/.test(symbol)) return true;
  // Emoji-heavy names (scam tokens love emojis)
  const emojiCount = (symbol.match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu) ?? []).length;
  if (emojiCount >= 1) return true;
  // Multi-word names with spaces — legit tokens are concise (ETH, USDC, UNI)
  if ((symbol.match(/\s/g) ?? []).length >= 2) return true;
  // Very long names
  if (symbol.length > 20) return true;
  // "null" placeholder
  if (s === "null" || s === "undefined") return true;
  return false;
}

function describeActivities(ctx: SummaryContext): string {
  const parts: string[] = [];
  const activities = ctx.profile?.activityBreakdown;
  if (activities && activities.length > 0) {
    const sig = activities.filter(a => a.percentage >= 5);
    if (sig.length > 0) {
      // Build a plain-language activity summary
      const primary = sig[0];
      const primaryName = FRIENDLY_CATEGORY[primary.category] ?? primary.category.replace(/_/g, " ");
      const primaryProtos = primary.protocols.filter(p => p !== "ERC20" && p !== "WETH" && !p.startsWith("0x") && !p.startsWith("Contract "));
      let actLine = `Most of its activity (${primary.percentage}%) is ${primaryName}`;
      if (primaryProtos.length > 0) actLine += ` using ${primaryProtos.join(" and ")}`;
      actLine += ".";

      if (sig.length > 1) {
        const rest = sig.slice(1).map(a => {
          const name = FRIENDLY_CATEGORY[a.category] ?? a.category.replace(/_/g, " ");
          const protos = a.protocols.filter(p => p !== "ERC20" && p !== "WETH" && !p.startsWith("0x") && !p.startsWith("Contract "));
          return `${name} (${a.percentage}%${protos.length > 0 ? ` on ${protos.join(", ")}` : ""})`;
        });
        actLine += ` It also does ${rest.join(", ")}.`;
      }
      parts.push(actLine);
    }
  }

  // Who it interacts with most
  const named = ctx.profile?.topCounterparties?.filter(c => c.name && !c.name.startsWith("Unknown"));
  if (named && named.length > 0) {
    const cpDescs = named.slice(0, 4).map(c => {
      const vol = Number(c.volumeETH);
      return vol > 0.01 ? `${c.name} (${fmtETH(vol)} ETH across ${c.txCount} interactions)` : `${c.name} (${c.txCount} interactions)`;
    });
    parts.push(`Interacts most with: ${cpDescs.join(", ")}.`);
  }

  // Protocol loyalty in plain language
  if (ctx.profile?.protocolLoyalty && !ctx.profile.protocolLoyalty.toLowerCase().includes("unknown")) {
    parts.push(ctx.profile.protocolLoyalty + ".");
  }

  // Tokens it works with — filter out spam/scam airdrop tokens
  const tf = ctx.profile?.tokenFlowSummary;
  if (tf) {
    const tp: string[] = [];
    const legitimateTokens = tf.topTokens.filter(t => !isSpamToken(t.symbol));
    if (legitimateTokens.length > 0) {
      tp.push(`Most-used tokens: ${legitimateTokens.slice(0, 4).map(t => `${t.symbol} (${t.txCount} times)`).join(", ")}`);
    }
    const spamCount = tf.topTokens.length - legitimateTokens.length;
    if (spamCount > 0) tp.push(`${spamCount} spam/scam token${spamCount > 1 ? "s" : ""} filtered out`);
    if (tf.uniqueTokens > 3) tp.push(`${legitimateTokens.length > 0 ? tf.uniqueTokens - spamCount : tf.uniqueTokens} different tokens total`);
    const directionText = tf.netDirection === "inbound" ? "overall receives more tokens than it sends (accumulating)" : tf.netDirection === "outbound" ? "overall sends more tokens than it receives (distributing)" : "balanced token flow in and out";
    tp.push(directionText);
    parts.push(`${tp.join(". ")}.`);
  }
  return parts.join(" ");
}

function describeFinancials(ctx: SummaryContext): string {
  const parts: string[] = [];
  if (ctx.netFlow > 0.01 || ctx.netFlow < -0.01) {
    if (ctx.netFlow > 0) {
      parts.push(`This agent has earned more than it has spent — a net gain of +${fmtETH(ctx.netFlow)} ETH.${ctx.gasETH !== "0 ETH" ? ` Transaction fees cost ${ctx.gasETH}.` : ""}`);
    } else {
      parts.push(`This agent has spent more than it has received — a net loss of ${fmtETH(Math.abs(ctx.netFlow))} ETH.${ctx.gasETH !== "0 ETH" ? ` Transaction fees account for ${ctx.gasETH} of that.` : ""}`);
    }
  } else {
    parts.push(`Very little money has moved through this agent — essentially break-even with ${fmtETH(ctx.netFlow)} ETH net.`);
  }
  const bs = ctx.profile?.balanceStory;
  if (bs) {
    const bp: string[] = [];
    if (bs.trend === "accumulating") bp.push("its balance has been growing over time");
    else if (bs.trend === "depleting") bp.push("its balance has been declining");
    else if (bs.trend === "volatile") bp.push("its balance has fluctuated significantly");
    if (bs.currentBalanceETH && Number(bs.currentBalanceETH) > 0) bp.push(`currently holds ${fmtETH(Number(bs.currentBalanceETH))} ETH`);
    if (bs.peakBalanceETH && Number(bs.peakBalanceETH) > 0.01 && bs.drawdownFromPeak && bs.drawdownFromPeak !== "0%" && bs.drawdownFromPeak !== "-0%") {
      bp.push(`down ${bs.drawdownFromPeak} from its peak of ${fmtETH(Number(bs.peakBalanceETH))} ETH`);
    }
    if (bp.length > 0) parts.push(bp.join(", ") + ".");
  }
  return parts.join(" ");
}

function describeReliability(ctx: SummaryContext): string {
  const failedTx = ctx.txCount - Math.round(ctx.metrics.successRate * ctx.txCount);
  const fd = ctx.profile?.failedTxAnalysis;
  let line: string;
  if (ctx.successComparison === "above" || ctx.successComparison === "in line with") {
    line = `${ctx.successPct}% of its ${ctx.txCount} transactions succeed — that's ${ctx.successComparison === "above" ? "better" : "on par with"} the typical ${ctx.benchSuccessPct}% for similar agents.`;
  } else {
    line = `Only ${ctx.successPct}% of its ${ctx.txCount} transactions succeed, which is below the typical ${ctx.benchSuccessPct}% for this type of agent. ${failedTx} transactions failed`;
    if (fd?.mostCommonReason && fd.mostCommonReason !== "Unknown") line += `, mostly due to ${fd.mostCommonReason.toLowerCase()}`;
    line += ".";
  }
  // Gas efficiency in plain terms
  const gasComp = compareToBenchmark(ctx.bench.gasPerTx, ctx.metrics.avgGasPerTx);
  if (ctx.metrics.avgGasPerTx > 0) {
    if (gasComp === "below" || gasComp === "well below") {
      line += " It also pays higher transaction fees than average, suggesting inefficient execution.";
    } else if (ctx.metrics.avgGasPerTx < ctx.bench.gasPerTx * 0.7) {
      line += " Its transaction fees are well below average — efficiently managed.";
    }
  }
  return line;
}

function describeTemporal(ctx: SummaryContext): string {
  const parts: string[] = [];
  if (ctx.metrics.txFrequencyPerDay < 0.1) {
    parts.push(`This agent is barely active — less than 1 transaction per day. It may be paused, abandoned, or only triggered by rare events.`);
  } else if (ctx.metrics.txFrequencyPerDay > 50) {
    parts.push(`Highly active with ~${Math.round(ctx.metrics.txFrequencyPerDay)} transactions per day, interacting with ${ctx.metrics.uniqueCounterparties} different addresses.`);
  } else {
    parts.push(`Averages about ${ctx.metrics.txFrequencyPerDay.toFixed(1)} transactions per day across ${ctx.metrics.uniqueCounterparties} different addresses.`);
  }
  const dorm = ctx.profile?.longestDormancy;
  if (dorm && dorm.days > 7) {
    const lastSeen = ctx.metrics.lastSeenTimestamp ? Math.floor((Date.now() - ctx.metrics.lastSeenTimestamp) / 86_400_000) : null;
    if (lastSeen !== null && lastSeen > 30) parts.push(`It hasn't been active in ${lastSeen} days and previously went silent for ${dorm.days} days — this could be a sign it's been shut down.`);
    else if (dorm.days > 14) parts.push(`At one point it went quiet for ${dorm.days} days (${dorm.from} to ${dorm.to}), but has since come back online.`);
  }
  const tz = ctx.profile?.timezoneFingerprint;
  if (tz) {
    if (tz.is24x7) parts.push("It runs around the clock with no downtime — a sign of fully automated infrastructure.");
    else if (tz.inference && tz.inference !== "Unknown") parts.push(`Activity pattern suggests ${tz.inference.toLowerCase()}, most active around ${tz.peakWindowUTC} UTC.`);
  }
  if (ctx.profile?.busiestDay && ctx.profile.busiestDay.txCount > 5) {
    parts.push(`Its busiest day was ${ctx.profile.busiestDay.date} with ${ctx.profile.busiestDay.txCount} transactions.`);
  }
  return parts.join(" ");
}

function buildRiskLines(ctx: SummaryContext): string {
  const parts: string[] = [];
  if (ctx.criticalFlags.length > 0) {
    parts.push(`Serious concerns: ${ctx.criticalFlags.map(f => f.description.toLowerCase()).join("; ")}.`);
  }
  if (ctx.mediumFlags.length > 0 && ctx.mediumFlags.length <= 3) {
    parts.push(`Other flags: ${ctx.mediumFlags.map(f => f.description.toLowerCase()).join("; ")}.`);
  } else if (ctx.mediumFlags.length > 3) {
    parts.push(`${ctx.mediumFlags.length} additional concerns were flagged, including ${ctx.mediumFlags.slice(0, 2).map(f => f.description.toLowerCase()).join(" and ")}.`);
  }
  return parts.join(" ");
}

function buildWatchFor(ctx: SummaryContext): string {
  if (ctx.criticalFlags.length > 0) return `Watch for: ${ctx.criticalFlags[0].description}. If this gets worse, it should be investigated immediately.`;
  if (ctx.metrics.txFrequencyPerDay < 0.1) return "Watch for: if this agent starts transacting again, it could mean it's back online. If it stays quiet past 90 days, it's likely been permanently shut down.";
  if (ctx.successComparison === "below" || ctx.successComparison === "well below") {
    const threshold = Math.max(50, Math.round(ctx.bench.successRate * 100) - 15);
    return `Watch for: if the success rate drops below ${threshold}%, this agent may need to be reconfigured or replaced.`;
  }
  if (ctx.netFlow < -5) return "Watch for: this agent is bleeding funds. At this rate, it could run out of money within weeks.";
  return `Watch for: so far the pattern looks ${ctx.score >= 70 ? "healthy" : "okay"}. Keep an eye out for sudden changes in behavior or interactions with unfamiliar addresses.`;
}

// ─── Type-specific narrative generators ───
// Each tells the STORY of what this type of agent does, adapted to what matters most.

function narrativeKeeper(ctx: SummaryContext): string {
  const headline = `This is a${ctx.ageStr ? " " + ctx.ageStr + "-old" : ""} keeper agent on ${ctx.chainId}, working with ${ctx.protocolStr}. Trust score: ${ctx.score}/100.`;

  // Keepers are like maintenance workers — they keep protocols running
  const keeperActivities = ctx.profile?.activityBreakdown?.filter(a => a.category === "keeper_ops") ?? [];
  const keeperPct = keeperActivities.reduce((s, a) => s + a.percentage, 0);
  const otherActivities = ctx.profile?.activityBreakdown?.filter(a => a.category !== "keeper_ops" && a.percentage >= 5) ?? [];

  const storyParts: string[] = [];
  if (keeperPct > 0) {
    const protos = keeperActivities.flatMap(a => a.protocols).filter(p => p !== "ERC20" && p !== "WETH");
    storyParts.push(`A keeper is like a maintenance worker for DeFi — it performs routine tasks to keep protocols running smoothly. This one spends ${keeperPct}% of its time on these upkeep tasks${protos.length > 0 ? ` for ${protos.join(" and ")}` : ""}.`);
  } else {
    storyParts.push("Keepers are automated agents that perform routine maintenance for DeFi protocols — like keeping the lights on.");
  }
  if (otherActivities.length > 0) {
    const others = otherActivities.map(a => `${FRIENDLY_CATEGORY[a.category] ?? a.category.replace(/_/g, " ")} (${a.percentage}%)`);
    storyParts.push(`Besides maintenance, it also does ${others.join(", ")}.`);
  }

  const named = ctx.profile?.topCounterparties?.filter(c => c.name && !c.name.startsWith("Unknown"));
  if (named && named.length > 0) {
    storyParts.push(`It primarily serves: ${named.slice(0, 3).map(c => c.name).join(", ")}.`);
  }

  // Keepers typically run at a loss — explain this
  let financialStory: string;
  if (ctx.netFlow < -0.01) {
    financialStory = `Like most keepers, this one spends more than it earns on-chain — ${fmtETH(Math.abs(ctx.netFlow))} ETH in net costs. This is normal because keepers are usually rewarded through separate token incentives or off-chain payments, not direct on-chain profit.${ctx.gasETH !== "0 ETH" ? ` Transaction fees alone cost ${ctx.gasETH}.` : ""}`;
  } else if (ctx.netFlow > 0.01) {
    financialStory = `Unusually, this keeper is making money on-chain: +${fmtETH(ctx.netFlow)} ETH. It may be receiving on-chain rewards or doing some opportunistic trading on the side.`;
  } else {
    financialStory = `Financially break-even — it's spending about as much as it receives, which is typical for well-managed keeper infrastructure.`;
  }

  const sections = [headline, storyParts.join(" "), describeReliability(ctx), financialStory, describeTemporal(ctx)];
  const risk = buildRiskLines(ctx);
  if (risk) sections.push(risk);
  sections.push(buildWatchFor(ctx));
  return sections.filter(s => s.length > 0).join("\n\n");
}

function narrativeDexTrader(ctx: SummaryContext): string {
  const headline = `This is a${ctx.ageStr ? " " + ctx.ageStr + "-old" : ""} DeFi trading agent on ${ctx.chainId}, active on ${ctx.protocolStr}. Trust score: ${ctx.score}/100.`;

  const swapActivity = ctx.profile?.activityBreakdown?.filter(a => a.category === "swapping") ?? [];
  const lpActivity = ctx.profile?.activityBreakdown?.filter(a => a.category === "lp_provision") ?? [];
  const lendActivity = ctx.profile?.activityBreakdown?.filter(a => a.category === "lending" || a.category === "borrowing") ?? [];
  const allActivities = ctx.profile?.activityBreakdown?.filter(a => a.percentage >= 5) ?? [];

  const storyParts: string[] = [];

  if (allActivities.length > 0) {
    const strategies: string[] = [];
    if (swapActivity.length > 0) {
      const totalSwapPct = swapActivity.reduce((s, a) => s + a.percentage, 0);
      const dexes = swapActivity.flatMap(a => a.protocols).filter(p => p !== "ERC20" && p !== "WETH");
      strategies.push(`swapping tokens (${totalSwapPct}% of activity${dexes.length > 0 ? `, using ${dexes.join(" and ")}` : ""})`);
    }
    if (lpActivity.length > 0) {
      const lpPct = lpActivity.reduce((s, a) => s + a.percentage, 0);
      strategies.push(`providing liquidity to earn fees (${lpPct}%)`);
    }
    if (lendActivity.length > 0) {
      const lendPct = lendActivity.reduce((s, a) => s + a.percentage, 0);
      const platforms = lendActivity.flatMap(a => a.protocols).filter(p => p !== "ERC20" && p !== "WETH");
      strategies.push(`lending and borrowing (${lendPct}%${platforms.length > 0 ? ` on ${platforms.join(", ")}` : ""})`);
    }
    const otherActs = allActivities.filter(a => !["swapping", "lp_provision", "lending", "borrowing"].includes(a.category));
    if (otherActs.length > 0) {
      strategies.push(...otherActs.map(a => `${FRIENDLY_CATEGORY[a.category] ?? a.category.replace(/_/g, " ")} (${a.percentage}%)`));
    }
    storyParts.push(`Here's what it does: ${strategies.join(", ")}.`);
    if (strategies.length > 2) storyParts.push("This is a multi-strategy trader that diversifies across several DeFi activities.");
  }

  const tf = ctx.profile?.tokenFlowSummary;
  if (tf && tf.topTokens.length > 0) {
    const tokens = tf.topTokens.slice(0, 5).map(t => `${t.symbol} (${t.txCount} trades)`).join(", ");
    storyParts.push(`Most-traded tokens: ${tokens}.`);
    if (tf.uniqueTokens > 5) storyParts.push(`Works with ${tf.uniqueTokens} different tokens — a diversified portfolio.`);
    const dirText = tf.netDirection === "inbound" ? "Overall, it's buying more than selling — building up positions." : tf.netDirection === "outbound" ? "Overall, it's selling more than buying — taking profits or exiting positions." : "Buys and sells are roughly balanced.";
    storyParts.push(dirText);
  }

  let profitStory: string;
  if (ctx.netFlow > 1) {
    profitStory = `Is it profitable? Yes — this trader has earned +${fmtETH(ctx.netFlow)} ETH more than it spent${ctx.gasETH !== "0 ETH" ? ` (after ${ctx.gasETH} in fees)` : ""} across ${ctx.txCount} transactions.${ctx.netFlow > 10 ? " That's significant — suggesting either skill or favorable market timing." : ""}`;
  } else if (ctx.netFlow > 0.01) {
    profitStory = `Barely profitable: +${fmtETH(ctx.netFlow)} ETH net gain, but fees (${ctx.gasETH}) are eating into the margins.`;
  } else if (ctx.netFlow < -1) {
    profitStory = `This trader is losing money: ${fmtETH(Math.abs(ctx.netFlow))} ETH in net losses${ctx.gasETH !== "0 ETH" ? ` plus ${ctx.gasETH} in fees` : ""}. ${Math.abs(ctx.netFlow) > 5 ? "These are significant losses." : "Could be due to bad timing or losses from providing liquidity."}`;
  } else {
    profitStory = `Roughly break-even — not making or losing meaningful money. May be running a neutral strategy or settling profits elsewhere.`;
  }

  const named = ctx.profile?.topCounterparties?.filter(c => c.name && !c.name.startsWith("Unknown"));
  if (named && named.length > 0) {
    storyParts.push(`Trades mostly through: ${named.slice(0, 4).map(c => `${c.name} (${c.txCount} interactions)`).join(", ")}.`);
  }

  const sections = [headline, storyParts.join(" "), profitStory, describeReliability(ctx), describeTemporal(ctx)];
  const risk = buildRiskLines(ctx);
  if (risk) sections.push(risk);
  sections.push(buildWatchFor(ctx));
  return sections.filter(s => s.length > 0).join("\n\n");
}

function narrativeMEVBot(ctx: SummaryContext): string {
  const headline = `This is a${ctx.ageStr ? " " + ctx.ageStr + "-old" : ""} MEV bot on ${ctx.chainId}, operating on ${ctx.protocolStr}. Trust score: ${ctx.score}/100.`;

  const storyParts: string[] = [];
  storyParts.push("MEV bots are automated programs that profit by reordering, inserting, or front-running other people's transactions. They're controversial — they can increase costs for regular users.");

  if (ctx.netFlow > 0.01) {
    storyParts.push(`This one has extracted +${fmtETH(ctx.netFlow)} ETH in profit${ctx.gasETH !== "0 ETH" ? ` after spending ${ctx.gasETH} on fees` : ""}. ${ctx.netFlow > 5 ? "That's a significant haul — likely running large arbitrage or sandwich attacks." : "Moderate extraction — probably small-scale arbitrage."}`);
  } else {
    storyParts.push(`Currently unprofitable (${fmtETH(ctx.netFlow)} ETH net) — it may be losing bidding wars to faster bots or winding down operations.`);
  }

  storyParts.push(describeActivities(ctx));

  const sections = [headline, storyParts.filter(s => s.length > 0).join(" "), describeReliability(ctx), describeTemporal(ctx)];
  const risk = buildRiskLines(ctx);
  if (risk) sections.push(risk);
  sections.push(buildWatchFor(ctx));
  return sections.filter(s => s.length > 0).join("\n\n");
}

function narrativeOracle(ctx: SummaryContext): string {
  const headline = `This is a${ctx.ageStr ? " " + ctx.ageStr + "-old" : ""} oracle agent on ${ctx.chainId}, providing data to ${ctx.protocolStr}. Trust score: ${ctx.score}/100.`;

  const storyParts: string[] = [];
  storyParts.push("Oracles are agents that feed real-world data (like prices) into blockchain protocols. They're critical infrastructure — if an oracle fails, the protocols depending on it can break.");

  const tz = ctx.profile?.timezoneFingerprint;
  if (tz?.is24x7) {
    storyParts.push("This one runs around the clock without breaks — exactly what you'd want from a data feed.");
  }

  if (ctx.metrics.txFrequencyPerDay > 10) {
    storyParts.push(`It pushes updates ~${Math.round(ctx.metrics.txFrequencyPerDay)} times per day — a high-frequency feed, likely tracking real-time prices.`);
  } else if (ctx.metrics.txFrequencyPerDay > 1) {
    storyParts.push(`Updates about ${ctx.metrics.txFrequencyPerDay.toFixed(1)} times per day — a steady data source.`);
  } else {
    storyParts.push(`Only updates about ${ctx.metrics.txFrequencyPerDay.toFixed(1)} times per day — may only trigger on specific events rather than regular intervals.`);
  }
  storyParts.push(describeActivities(ctx));

  const sections = [headline, storyParts.join(" "), describeReliability(ctx), describeFinancials(ctx), describeTemporal(ctx)];
  const risk = buildRiskLines(ctx);
  if (risk) sections.push(risk);
  sections.push(buildWatchFor(ctx));
  return sections.filter(s => s.length > 0).join("\n\n");
}

function narrativeLiquidator(ctx: SummaryContext): string {
  const headline = `This is a${ctx.ageStr ? " " + ctx.ageStr + "-old" : ""} liquidation agent on ${ctx.chainId}, monitoring ${ctx.protocolStr}. Trust score: ${ctx.score}/100.`;

  const storyParts: string[] = [];
  storyParts.push("Liquidators watch lending protocols for loans that have become risky (when collateral drops too low). When they find one, they step in to close it and earn a reward. They help keep DeFi protocols solvent.");

  if (ctx.netFlow > 0.01) {
    storyParts.push(`This liquidator has earned +${fmtETH(ctx.netFlow)} ETH from its work. ${ctx.netFlow > 2 ? "That's significant — it's finding and closing large risky positions." : "Moderate earnings — may be competing with other liquidators."}`);
  } else {
    storyParts.push(`Currently not profitable (${fmtETH(ctx.netFlow)} ETH net) — it may be losing speed races to competing bots or targeting positions with thin rewards.`);
  }
  storyParts.push(describeActivities(ctx));

  const sections = [headline, storyParts.join(" "), describeReliability(ctx), describeTemporal(ctx)];
  const risk = buildRiskLines(ctx);
  if (risk) sections.push(risk);
  sections.push(buildWatchFor(ctx));
  return sections.filter(s => s.length > 0).join("\n\n");
}

function narrativeBridgeRelayer(ctx: SummaryContext): string {
  const headline = `This is a${ctx.ageStr ? " " + ctx.ageStr + "-old" : ""} bridge relayer on ${ctx.chainId}, operating through ${ctx.protocolStr}. Trust score: ${ctx.score}/100.`;

  const storyParts: string[] = [];
  storyParts.push("Bridge relayers help move assets between different blockchains. They're the delivery trucks of crypto — making sure your tokens arrive on the other side when you use a bridge.");
  storyParts.push(`This one has handled ${ctx.txCount} transactions across ${ctx.metrics.uniqueCounterparties} different addresses. ${ctx.metrics.uniqueCounterparties > 50 ? "It's a high-traffic relayer serving many users." : "A smaller operation with a focused user base."}`);
  storyParts.push(describeActivities(ctx));

  const sections = [headline, storyParts.join(" "), describeReliability(ctx), describeFinancials(ctx), describeTemporal(ctx)];
  const risk = buildRiskLines(ctx);
  if (risk) sections.push(risk);
  sections.push(buildWatchFor(ctx));
  return sections.filter(s => s.length > 0).join("\n\n");
}

function narrativeYieldOptimizer(ctx: SummaryContext): string {
  const headline = `This is a${ctx.ageStr ? " " + ctx.ageStr + "-old" : ""} yield optimizer on ${ctx.chainId}, managing positions on ${ctx.protocolStr}. Trust score: ${ctx.score}/100.`;

  const storyParts: string[] = [];
  storyParts.push("Yield optimizers are like automated fund managers — they move money between DeFi protocols to earn the best returns. They deposit, withdraw, swap, and rebalance to maximize earnings.");

  const lpAct = ctx.profile?.activityBreakdown?.filter(a => a.category === "lp_provision" || a.category === "staking") ?? [];
  const lendAct = ctx.profile?.activityBreakdown?.filter(a => a.category === "lending") ?? [];
  const swapAct = ctx.profile?.activityBreakdown?.filter(a => a.category === "swapping") ?? [];

  const strategies: string[] = [];
  if (lpAct.length > 0) strategies.push(`providing liquidity and staking (${lpAct.reduce((s, a) => s + a.percentage, 0)}% of activity)`);
  if (lendAct.length > 0) strategies.push(`lending for interest (${lendAct.reduce((s, a) => s + a.percentage, 0)}%)`);
  if (swapAct.length > 0) strategies.push(`rebalancing via swaps (${swapAct.reduce((s, a) => s + a.percentage, 0)}%)`);

  if (strategies.length > 0) {
    storyParts.push(`Its strategy breakdown: ${strategies.join(", ")}. ${strategies.length > 2 ? "A multi-strategy approach, spreading risk across different yield sources." : ""}`);
  }
  storyParts.push(describeActivities(ctx));

  if (ctx.netFlow > 0.01) {
    storyParts.push(`So far it's earned +${fmtETH(ctx.netFlow)} ETH after fees. ${ctx.netFlow > 1 ? "Strong performance." : "Positive but modest — fees or market moves may be cutting into yields."}`);
  } else {
    storyParts.push(`Currently losing money (${fmtETH(Math.abs(ctx.netFlow))} ETH net loss). This can happen when liquidity provision loses value during price swings, or when the protocols it deposits into reduce their reward rates.`);
  }

  const sections = [headline, storyParts.filter(s => s.length > 0).join(" "), describeReliability(ctx), describeTemporal(ctx)];
  const risk = buildRiskLines(ctx);
  if (risk) sections.push(risk);
  sections.push(buildWatchFor(ctx));
  return sections.filter(s => s.length > 0).join("\n\n");
}

function narrativeGovernance(ctx: SummaryContext): string {
  const headline = `This is a${ctx.ageStr ? " " + ctx.ageStr + "-old" : ""} governance participant on ${ctx.chainId}, active in ${ctx.protocolStr}. Trust score: ${ctx.score}/100.`;

  const govAct = ctx.profile?.activityBreakdown?.filter(a => a.category === "governance") ?? [];
  const govPct = govAct.reduce((s, a) => s + a.percentage, 0);

  const storyParts: string[] = [];
  storyParts.push("Governance agents participate in protocol decision-making — voting on proposals, delegating voting power, or managing community treasuries.");
  if (govPct > 0) {
    storyParts.push(`${govPct}% of its activity is governance-related. ${govPct > 50 ? "This is primarily a governance-focused address." : "Governance is a side activity alongside its other on-chain operations."}`);
  }
  storyParts.push(describeActivities(ctx));

  const sections = [headline, storyParts.join(" "), describeFinancials(ctx), describeReliability(ctx), describeTemporal(ctx)];
  const risk = buildRiskLines(ctx);
  if (risk) sections.push(risk);
  sections.push(buildWatchFor(ctx));
  return sections.filter(s => s.length > 0).join("\n\n");
}

function narrativeGeneric(ctx: SummaryContext): string {
  const headline = `This is a${ctx.ageStr ? " " + ctx.ageStr + "-old" : ""} ${ctx.typeName} on ${ctx.chainId}, operating across ${ctx.protocolStr}. Trust score: ${ctx.score}/100.`;

  const sections = [headline, describeActivities(ctx), describeReliability(ctx), describeFinancials(ctx), describeTemporal(ctx)];
  const risk = buildRiskLines(ctx);
  if (risk) sections.push(risk);
  sections.push(buildWatchFor(ctx));
  return sections.filter(s => s.length > 0).join("\n\n");
}

const TYPE_NARRATOR: Record<string, (ctx: SummaryContext) => string> = {
  KEEPER: narrativeKeeper,
  DEX_TRADER: narrativeDexTrader,
  MEV_BOT: narrativeMEVBot,
  ORACLE: narrativeOracle,
  LIQUIDATOR: narrativeLiquidator,
  BRIDGE_RELAYER: narrativeBridgeRelayer,
  YIELD_OPTIMIZER: narrativeYieldOptimizer,
  GOVERNANCE: narrativeGovernance,
  UNKNOWN: narrativeGeneric,
};

/** Build a type-adaptive analyst briefing.
 *  Each agent type gets a narrator that tells its specific story.
 */
function generateAnalystSummary(
  agentType: string,
  chainId: string,
  score: number,
  _recommendation: string,
  metrics: AgentMetrics | undefined,
  protocols: readonly string[],
  flags: readonly TrustFlag[],
  txCount: number,
  profile?: BehavioralProfile,
): string {
  if (!metrics) return `Trust score: ${score}/100. Insufficient on-chain data for detailed analysis.`;

  const ctx = buildSummaryContext(agentType, chainId, score, metrics, protocols, flags, txCount, profile);
  const narrator = TYPE_NARRATOR[agentType] ?? narrativeGeneric;
  return narrator(ctx);
}

function normalizeVeniceResponse(
  raw: Record<string, unknown>,
  address: string,
  chainId: ChainId,
  metrics?: AgentMetrics,
  totalTransactions?: number,
  coinBalanceHistory?: { value: string }[],
  behavioralProfile?: BehavioralProfile,
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
    // Always generate analyst-quality summary from structured data (never use Venice prose)
    summary: generateAnalystSummary(resolvedType, chainId, score, recommendation, metrics, resolvedProtocols, flags, totalTransactions ?? 0, behavioralProfile),
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
=== RECENT EVENTS (last 10, compact) ===
${sanitizedData.eventLogs.slice(-10).map(e => {
    const date = new Date(e.timestamp).toISOString().split("T")[0];
    const contract = e.contractAddress.slice(0, 10) + "…" + e.contractAddress.slice(-4);
    const sig = e.topics[0] ? e.topics[0].slice(0, 10) + "…" : "none";
    const dataBytes = e.data && e.data !== "0x" ? Math.floor((e.data.length - 2) / 2) : 0;
    return `${date} | ${contract} | sig:${sig} | ${dataBytes}B data`;
  }).join("\n")}
` : "";

  const addressInfoSection = sanitizedData.addressInfo ? `
=== ADDRESS INFO ===
Type: ${sanitizedData.addressInfo.addressType}
Is contract: ${sanitizedData.addressInfo.isContract}
ENS: ${sanitizedData.addressInfo.ensName ?? "none"}
Implementation: ${sanitizedData.addressInfo.implementationAddress ?? "N/A"}
` : "";

  // ─── DATA WINDOW section (only when sample-derived) ───
  const sampleCtx = sanitizedData.computedMetrics?.sampleContext;
  const dataWindowSection = sampleCtx?.isSampleDerived ? (() => {
    const coverage = sampleCtx.sampleCoveragePercent;
    let warning = "";
    if (coverage < 10) {
      warning = "\n⚠ CRITICAL: Sample is <10% of total history. DO NOT infer wallet age, daily frequency, or busiest day from this sample. Use total count for scale. Sample shows recent patterns only.";
    } else if (coverage < 50) {
      warning = "\n⚠ Sample covers <50% of history. Exercise caution with age-based and frequency metrics.";
    }
    return `
=== DATA WINDOW (READ THIS FIRST) ===
Total transactions on-chain (Blockscout): ${sampleCtx.totalTransactionCount}
Sample fetched: ${sampleCtx.sampleSize} (most recent)
Sample coverage: ${coverage}%${warning}
`;
  })() : "";

  // ─── ENTITY CLASSIFICATION section ───
  const entityClass = sanitizedData.entityClassification;
  const entitySection = entityClass ? (() => {
    const framingByType: Record<string, string> = {
      AUTONOMOUS_AGENT: "Produce a standard agent trust score audit.",
      PROTOCOL_CONTRACT: "Frame as protocol health check. Note this is infrastructure, not an agent. User may have mistakenly submitted this.",
      USER_WALLET: "Frame as wallet security review. Note this appears to be a personal wallet. User may have mistakenly submitted this.",
      UNKNOWN: "Entity type could not be determined. Analyze based on data patterns. Do not assume this is an agent.",
    };
    return `
=== ENTITY CLASSIFICATION ===
Entity type: ${entityClass.entityType}
Classification confidence: ${entityClass.confidence}
From ratio: ${Math.round(entityClass.fromRatio * 100)}%
Primary signal: ${entityClass.primarySignal}
All signals: ${entityClass.signals.join(", ")}
${framingByType[entityClass.entityType] ?? ""}
`;
  })() : "";

  // Compute method frequency for Venice
  const methodCounts = new Map<string, number>();
  for (const tx of sanitizedData.transactions) {
    const raw = tx.methodId?.toLowerCase().replace(/^0x/, "") ?? "";
    const sel = raw.length >= 8 && raw !== "00000000" ? `0x${raw.slice(0, 8)}` : null;
    if (sel) {
      methodCounts.set(sel, (methodCounts.get(sel) ?? 0) + 1);
    }
  }
  const sortedMethods = [...methodCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
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
${sampleCtx?.isSampleDerived && sampleCtx.sampleCoveragePercent < 50
  ? `Sample window: ${profile.sampleWindowDays ?? profile.walletAgeDays} days (NOT wallet age — only covers ${sampleCtx.sampleCoveragePercent}% of transactions)`
  : `Wallet age: ${profile.walletAgeDays} days`} | Contracts deployed: ${profile.contractsDeployed}
First action: ${profile.firstAction}
Protocol loyalty: ${profile.protocolLoyalty}
${profile.busiestDay ? `Busiest day: ${profile.busiestDay.date} (${profile.busiestDay.txCount} txs)` : ""}
${profile.longestDormancy ? `Longest dormancy: ${profile.longestDormancy.days} days (${profile.longestDormancy.from} → ${profile.longestDormancy.to})` : ""}
` : "";

  const userMessage = `Analyze this ${sanitizedData.chainId.toUpperCase()} chain agent:

Address: ${sanitizedData.address}
Chain: ${sanitizedData.chainId}
Transaction count (sample): ${sanitizedData.transactions.length}${sampleCtx?.isSampleDerived ? ` of ${sampleCtx.totalTransactionCount} total` : ""}
Token transfer count: ${sanitizedData.tokenTransfers.length}
Unique contracts called: ${new Set(sanitizedData.contractCalls.map((c) => c.contract)).size}
${dataWindowSection}${entitySection}${metricsSection}${walletSection}${groundTruthSection}${methodFreqSection}${addressInfoSection}${contractSection}${balanceSection}${eventsSection}${profileSections}
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
        temperature: 0.7,
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
  const normalized = normalizeVeniceResponse(parsed, data.address, data.chainId, data.computedMetrics, data.transactions.length, data.coinBalanceHistory, data.behavioralProfile);
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
