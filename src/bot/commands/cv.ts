import type { Bot } from "grammy";
import { setSession } from "../session.js";
import { hasDefaultCv } from "../../services/cvStorage.js";
import { bold, code, joinBlocks, replyHtml } from "../format.js";

export function registerCvCommand(bot: Bot): void {
  bot.command("cv", async (ctx) => {
    const telegramId = String(ctx.from!.id);
    await setSession(telegramId, "awaiting_cv");
    const existing = await hasDefaultCv(telegramId);

    const text = joinBlocks(
      bold("Upload CV"),
      existing
        ? "Kirim file PDF CV sekarang.\nCV lama akan diganti."
        : "Kirim file PDF CV sekarang.\nFile ini menjadi CV default untuk lamaran.",
      `Batal: ketik ${code("BATAL")}`,
    );

    await ctx.reply(text, replyHtml);
  });
}
