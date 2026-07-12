import { env } from "./config.js";
import { prisma } from "./db/prisma.js";
import { createBot, setupBotMenu } from "./bot/bot.js";
import { loadToken } from "./gmail/auth.js";
import { startScheduleWorker } from "./services/scheduleWorker.js";

async function main(): Promise<void> {
  await prisma.userSettings.upsert({
    where: { telegramId: env.TELEGRAM_USER_ID },
    create: { telegramId: env.TELEGRAM_USER_ID },
    update: {},
  });

  const token = await loadToken();
  if (!token?.refresh_token) {
    console.warn(
      "Peringatan: Gmail belum ter-auth. Jalankan `npm run gmail:auth` (dengan DATABASE_URL Postgres) sebelum mengirim email.",
    );
  } else if (token.email) {
    await prisma.userSettings.update({
      where: { telegramId: env.TELEGRAM_USER_ID },
      data: { gmailEmail: token.email },
    });
  }

  const bot = createBot();
  await setupBotMenu(bot);
  const scheduleTimer = startScheduleWorker(bot);

  console.log("Bot mulai polling…");
  console.log(`Allowlist user: ${env.TELEGRAM_USER_ID}`);
  console.log(`Max emails/day: ${env.MAX_EMAILS_PER_DAY}`);
  console.log(`LLM provider: ${env.LLM_PROVIDER}`);

  const shutdown = () => {
    clearInterval(scheduleTimer);
    void prisma.$disconnect().then(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await bot.start({
    onStart: (info) => {
      console.log(`@${info.username} online (polling)`);
    },
  });
}

main().catch(async (error) => {
  console.error("Fatal:", error);
  await prisma.$disconnect();
  process.exit(1);
});
