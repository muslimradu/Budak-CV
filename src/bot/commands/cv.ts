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
        ? "Kirim PDF CV kamu sekarang.\nCV lama akan aku ganti."
        : "Kirim PDF CV kamu sekarang.\nIni jadi CV default buat lamaran kamu.",
      `Batal? Ketik ${code("BATAL")}.`,
    );

    await ctx.reply(text, replyHtml);
  });
}
