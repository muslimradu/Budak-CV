import { Bot } from "grammy";
import { env } from "../config.js";
import { registerStartCommand } from "./commands/start.js";
import { registerCvCommand } from "./commands/cv.js";
import { registerDraftCommand } from "./commands/draft.js";
import { registerSendCommand } from "./commands/send.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerJobsCommand } from "./commands/jobs.js";
import { registerDeleteCommand } from "./commands/delete.js";
import { registerFollowUpCommand } from "./commands/followup.js";
import { registerLangCommand } from "./commands/lang.js";
import { registerRevisiCommand } from "./commands/revisi.js";
import { registerScheduleCommand } from "./commands/schedule.js";
import { registerMessageHandlers } from "./handlers/messages.js";
import { registerCallbackHandlers } from "./handlers/callbacks.js";
import { bold, joinBlocks, replyHtml } from "./format.js";

const COMMAND_MENU = [
  { command: "start", description: "Panduan & menu utama" },
  { command: "cv", description: "Upload PDF CV default" },
  { command: "draft", description: "Draft email (/draft atau /draft 3)" },
  { command: "revisi", description: "Revisi: /revisi sapaan: Mbak" },
  { command: "schedule", description: "Jadwalkan kirim (/schedule 18:00)" },
  { command: "followup", description: "Draft follow-up lamaran" },
  { command: "lang", description: "Bahasa email: auto / en / id" },
  { command: "send", description: "Kirim ke email@domain.com" },
  { command: "jobs", description: "Lihat lowongan aktif" },
  { command: "delete", description: "Hapus lowongan (/delete 3)" },
  { command: "status", description: "Riwayat lamaran" },
] as const;

export function createBot(): Bot {
  const bot = new Bot(env.TELEGRAM_BOT_TOKEN);
  const allowedId = env.TELEGRAM_USER_ID;

  bot.use(async (ctx, next) => {
    const fromId = ctx.from?.id;
    if (fromId === undefined || String(fromId) !== allowedId) {
      if (ctx.message) {
        await ctx.reply(
          joinBlocks(bold("Akses ditolak"), "Bot ini pribadi."),
          replyHtml,
        );
      }
      return;
    }
    await next();
  });

  bot.catch((err) => {
    console.error("Bot error:", err.error);
  });

  registerStartCommand(bot);
  registerCvCommand(bot);
  registerDraftCommand(bot);
  registerRevisiCommand(bot);
  registerScheduleCommand(bot);
  registerFollowUpCommand(bot);
  registerLangCommand(bot);
  registerSendCommand(bot);
  registerStatusCommand(bot);
  registerJobsCommand(bot);
  registerDeleteCommand(bot);
  registerMessageHandlers(bot);
  registerCallbackHandlers(bot);

  return bot;
}

export async function setupBotMenu(bot: Bot): Promise<void> {
  await bot.api.setMyCommands([...COMMAND_MENU]);
}
