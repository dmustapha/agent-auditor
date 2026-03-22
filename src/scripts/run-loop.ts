import { createServer } from "http";
import { createTelegramBot } from "../bot/telegram";
import { startLoop, getStatus } from "../lib/loop";

async function main() {
  // Health endpoint for Render web service
  const port = parseInt(process.env.PORT ?? "10000");
  createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(getStatus()));
  }).listen(port, () => console.log(`[health] Listening on :${port}`));

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;

  let sendAlert: (msg: string) => Promise<void>;

  if (telegramToken) {
    const { bot, sendAlert: alert } = createTelegramBot(telegramToken);
    sendAlert = alert;

    // Start bot (long polling)
    bot.start({
      onStart: () => console.log("[bot] Telegram bot started"),
    });
    console.log("[bot] Telegram bot running");
  } else {
    console.warn("[bot] No TELEGRAM_BOT_TOKEN — alerts will be logged only");
    sendAlert = async (msg) => console.log("[alert]", msg);
  }

  // Start autonomous loop
  const intervalMs = parseInt(process.env.LOOP_INTERVAL_MS ?? "300000"); // default 5 min
  startLoop(sendAlert, intervalMs);

  console.log("[loop] Autonomous loop started");
  console.log("[loop] Status:", JSON.stringify(getStatus(), null, 2));

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("\nShutting down...");
    process.exit(0);
  });
}

main().catch(console.error);
