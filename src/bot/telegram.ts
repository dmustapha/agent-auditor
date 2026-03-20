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
      await ctx.reply(`Error: ${err instanceof Error ? err.message : "Analysis failed"}`);
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

  return { bot, sendAlert };
}
