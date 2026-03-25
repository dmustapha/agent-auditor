import { createServer } from "http";
import { createTelegramBot } from "../bot/telegram";
import { startLoop, getStatus } from "../lib/loop";

async function main() {
  // Health endpoint — responds immediately, no blocking on RPC
  const port = parseInt(process.env.PORT ?? "10000");
  const startedAt = new Date().toISOString();

  createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ...getStatus(), startedAt }));
  }).listen(port, () => console.log(`[health] Listening on :${port}`));

  // Self-ping every 4 minutes to prevent Render free tier spin-down (15 min timeout)
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    setInterval(async () => {
      try {
        await fetch(`${renderUrl}/`);
        console.log("[keepalive] Self-ping OK");
      } catch {
        console.warn("[keepalive] Self-ping failed");
      }
    }, 4 * 60 * 1000);
    console.log(`[keepalive] Self-ping enabled every 4min → ${renderUrl}`);
  }

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

  let sendAlert: (msg: string) => Promise<void>;

  if (telegramToken) {
    const { bot, sendAlert: alert } = createTelegramBot(telegramToken);
    sendAlert = alert;

    // Start bot with drop_pending_updates to avoid conflict from old sessions
    bot.start({
      drop_pending_updates: true,
      onStart: () => console.log("[bot] Telegram bot started"),
    });
    console.log("[bot] Telegram bot running");
  } else {
    console.warn("[bot] No TELEGRAM_BOT_TOKEN — alerts will be logged only");
    sendAlert = async (msg) => console.log("[alert]", msg);
  }

  // Start autonomous loop (delay first run by 10s to let health check pass first)
  const intervalMs = parseInt(process.env.LOOP_INTERVAL_MS ?? "600000"); // default 10 min
  setTimeout(() => {
    startLoop(sendAlert, intervalMs);
    console.log("[loop] Autonomous loop started");
  }, 10_000);

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });
}

main().catch(console.error);
