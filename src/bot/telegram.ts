import { Bot, Context } from "grammy";
import type { ChainId, TrustScore } from "@/lib/types";
import { detectInputType, resolveInput } from "@/lib/resolver";
import { fetchAgentData, detectAllChainsWithActivity } from "@/lib/blockscout";
import { findAgentByAddress } from "@/lib/erc8004";
import { enrichAndAnalyze } from "@/lib/analyze-pipeline";
import { publishAttestation } from "@/lib/attestation";
import { formatForTelegram } from "@/lib/trust-score";
import { LRUCache } from "@/lib/cache";
import { checkRateLimit } from "@/lib/rate-limit";

// Telegram-specific cache (keyed by address:chain, stores TrustScore)
const telegramCache = new LRUCache<TrustScore>();

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
    // Rate limit by Telegram user ID
    const userId = String(ctx.from?.id ?? "unknown");
    const { allowed, retryAfterMs } = checkRateLimit(userId);
    if (!allowed) {
      const secs = Math.ceil(retryAfterMs / 1000);
      await ctx.reply(`Rate limited. Try again in ${secs}s.`);
      return;
    }

    const text = ctx.message?.text ?? "";
    // Strip @BotName suffix for group chat compatibility
    const parts = text.replace(/^\/audit(@\S+)?/, "").trim().split(/\s+/);

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

      // Fix 2: Check cache before doing any work
      const cacheKey = `${resolved.address}:${resolved.chainId}`;
      const cachedScore = telegramCache.get(cacheKey);
      if (cachedScore) {
        await ctx.reply(formatForTelegram(cachedScore, undefined), { parse_mode: "Markdown" });
        return;
      }

      const agentData = await fetchAgentData(resolved.chainId, resolved.address);

      // ERC-8004 reverse lookup (3s timeout, non-blocking)
      let effectiveAgentId: bigint | null = resolved.agentId ?? null;
      let isERC8004Registered = false;
      if (resolved.agentId) {
        isERC8004Registered = true;
      } else {
        try {
          const timeout = new Promise<null>(r => setTimeout(() => r(null), 3000));
          const id = await Promise.race([findAgentByAddress(resolved.chainId, resolved.address), timeout]);
          if (id !== null) {
            effectiveAgentId = id;
            isERC8004Registered = true;
          }
        } catch { /* non-fatal */ }
      }

      // Fix 1: Thread totalTxCount for accurate sample context
      const { trustScore } = await enrichAndAnalyze({
        agentData,
        totalTxCount: agentData.addressInfo?.transactionsCount,
        isERC8004Registered,
      });

      // Fix 2: Store result in cache
      telegramCache.set(cacheKey, trustScore);

      // Fix 5: On-chain attestation (fire-and-forget)
      if (effectiveAgentId !== null && process.env.PRIVATE_KEY) {
        publishAttestation(resolved.chainId, effectiveAgentId, trustScore).catch((attestErr) => {
          console.warn("[telegram] Attestation failed (non-fatal):", attestErr);
        });
      }

      await ctx.reply(formatForTelegram(trustScore, agentData.addressInfo?.ensName), { parse_mode: "Markdown" });
    } catch (err) {
      console.error("[telegram] audit error:", err);

      // Fix 4: Only surface known error patterns
      const errMsg = err instanceof Error ? err.message : "";
      const isNoActivity = errMsg.includes("No transaction activity");
      const isNotFound = errMsg.includes("No agent found");

      if (isNoActivity) {
        // Fix 3: Suggest other active chains when no activity on specified chain
        let suggestion = "";
        try {
          const inputType = detectInputType(input);
          if (inputType === "address") {
            const otherChains = await detectAllChainsWithActivity(input.trim().toLowerCase());
            const active = otherChains.filter(c => c.txCount > 0);
            if (active.length > 0) {
              const names = active.map(c => c.chainId).join(", ");
              suggestion = `\nThis address has activity on: ${names}\nTry: /audit ${input} ${active[0].chainId}`;
            }
          }
        } catch { /* chain detection failed */ }
        await ctx.reply(`No transaction activity found for this address.${suggestion}`);
      } else if (isNotFound) {
        await ctx.reply(`Error: ${errMsg}`);
      } else {
        await ctx.reply("Analysis failed. Please try again in a moment.");
      }
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
