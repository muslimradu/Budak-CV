import type { Bot } from "grammy";
import { deleteJobsListMessages, sendJobsList } from "../jobsList.js";

export function registerJobsCommand(bot: Bot): void {
  bot.command("jobs", async (ctx) => {
    const telegramId = String(ctx.from!.id);
    await deleteJobsListMessages(ctx, telegramId);
    await sendJobsList(ctx, telegramId, { detailed: true });
  });
}
