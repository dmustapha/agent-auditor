import { Bot, Context } from "grammy";
import type { ChainId } from "@/lib/types";
import { detectInputType, resolveInput } from "@/lib/resolver";
import { fetchAgentData } from "@/lib/blockscout";
import { createVeniceClient, analyzeAgent, resolveModel, createMockTrustScore } from "@/lib/venice";
import { validateTrustScore, formatForTelegram } from "@/lib/trust-score";

// ─── Bot Setup ───────────────────────────────────────────────────────────────

const VALID_CHAINS = new Set<string>(["base", "gnosis", "ethereum", "arbitrum", "optimism", "polygon"]);

export function createTelegramBot(token: string) {
  const bot = new Bot(token);
  const alertChannelId = process.env.TELEGRAM_CHANNEL_ID ?? "";

  // /start — welcome message
  bot.command("start", async (ctx: Context) => {
    await ctx.reply(
      `*Welcome to AgentAuditor* 🛡️\n\n` +
      `I analyze on-chain AI agents and score their trustworthiness using transaction history, behavioral patterns, and AI analysis.\n\n` +
      `*Commands:*\n` +
      `/audit <input> [chain] — Analyze an agent\n` +
      `/status — Check if the scanner is running\n` +
      `/help — Show usage examples\n\n` +
      `*Smart input — I accept:*\n` +
      `• Address: \`/audit 0x1234...abcd\`\n` +
      `• Agent ID: \`/audit 42\`\n` +
      `• Name: \`/audit AgentName\`\n\n` +
      `*Supported chains:* Base, Gnosis, Ethereum, Arbitrum, Optimism, Polygon`,
      { parse_mode: "Markdown" },
    );
  });

  // /help — detailed usage
  bot.command("help", async (ctx: Context) => {
    await ctx.reply(
      `*How to use AgentAuditor*\n\n` +
      `*Audit by address:*\n` +
      `\`/audit 0x1234...abcd\` — scans all chains\n` +
      `\`/audit 0x1234...abcd base\` — scans Base only\n\n` +
      `*Audit by Agent ID (ERC-8004):*\n` +
      `\`/audit 42\` — looks up agent #42\n` +
      `\`/audit 42 gnosis\` — on Gnosis only\n\n` +
      `*Audit by name:*\n` +
      `\`/audit AgentName\` — searches registered agents\n\n` +
      `*Result includes:*\n` +
      `• Trust score (0-100)\n` +
      `• Recommendation: SAFE / CAUTION / BLOCKLIST\n` +
      `• Risk flags with severity\n` +
      `• Chain identification\n\n` +
      `*Autonomous alerts:*\n` +
      `This bot also monitors all chains for new agents and sends alerts when risky ones are detected.`,
      { parse_mode: "Markdown" },
    );
  });

  // /audit <input> [chain]
  bot.command("audit", async (ctx: Context) => {
    const text = ctx.message?.text ?? "";
    const parts = text.replace("/audit", "").trim().split(/\s+/);

    if (parts.length === 0 || !parts[0]) {
      await ctx.reply("Usage: /audit <agent_id | address | name> [chain]\nExample: /audit 42 gnosis");
      return;
    }

    const input = parts[0];
    const chainArg = parts[1]?.toLowerCase();
    const chain: ChainId | "all" = chainArg && VALID_CHAINS.has(chainArg)
      ? (chainArg as ChainId)
      : "all";

    await ctx.reply(`Analyzing ${input}${chain !== "all" ? ` on ${chain}` : " across all chains"}...`);

    try {
      const inputType = detectInputType(input);
      const resolved = await resolveInput(input, inputType, chain);
      const agentData = await fetchAgentData(resolved.chainId, resolved.address);

      let trustScore;
      const useMock = process.env.VENICE_MOCK === "true";

      if (useMock) {
        trustScore = createMockTrustScore(resolved.address, resolved.chainId, agentData.transactions.length);
      } else {
        const apiKey = process.env.VENICE_API_KEY;
        if (!apiKey) {
          await ctx.reply("Venice API key not configured. Cannot analyze.");
          return;
        }
        const client = createVeniceClient(apiKey);
        const model = await resolveModel(client);
        const raw = await analyzeAgent(client, agentData, model);
        trustScore = validateTrustScore(raw);
      }

      await ctx.reply(formatForTelegram(trustScore), { parse_mode: "Markdown" });
    } catch (err) {
      console.error("[telegram] audit error:", err);
      const userMsg = err instanceof Error && err.message.includes("No transaction activity")
        ? err.message
        : "Analysis failed. Please try again in a moment.";
      await ctx.reply(`Error: ${userMsg}`);
    }
  });

  // /status
  bot.command("status", async (ctx: Context) => {
    await ctx.reply("AgentAuditor is running. Use /audit to analyze an agent.");
  });

  // ─── Alert Function (called by autonomous loop) ────────────────────────────

  async function sendAlert(message: string) {
    if (!alertChannelId) {
      console.warn("[telegram] No TELEGRAM_CHANNEL_ID configured, skipping alert");
      return;
    }
    try {
      await bot.api.sendMessage(alertChannelId, message, { parse_mode: "Markdown" });
    } catch (err) {
      console.error("[telegram] Failed to send alert:", err);
    }
  }

  // Register command menu with Telegram
  bot.api.setMyCommands([
    { command: "audit", description: "Analyze an on-chain AI agent" },
    { command: "status", description: "Check scanner status" },
    { command: "help", description: "Usage examples and supported chains" },
  ]).catch((err) => console.warn("[telegram] Failed to set commands:", err));

  return { bot, sendAlert };
}
