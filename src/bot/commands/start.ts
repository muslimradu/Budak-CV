import type { Bot } from "grammy";
import { env } from "../../config.js";
import { setSession } from "../session.js";
import { bold, code, joinBlocks, replyHtml } from "../format.js";
import { mainMenuInline, removeReplyKeyboard } from "../keyboard.js";

export function registerStartCommand(bot: Bot): void {
  bot.command("start", async (ctx) => {
    const text = joinBlocks(
      `${bold("Hai — aku Budak")}\nAku bantu kamu lamar kerja lewat Gmail.`,
      [
        bold("Caranya gampang"),
        `1. Upload CV kamu`,
        `2. Kirim lowongan (teks / PDF / foto)`,
        `3. Minta aku buatkan draft`,
        `4. Cek dulu, baru kirim / revisi / jadwal`,
      ].join("\n"),
      `Pilih menu di bawah ya. Butuh aku lagi? Ketik ${code("/start")}.`,
      `Tenang — email cuma terkirim kalau kamu bilang oke.\nBatas ${env.MAX_EMAILS_PER_DAY} email/hari.`,
    );

    const sent = await ctx.reply(text, {
      ...replyHtml,
      reply_markup: removeReplyKeyboard,
    });
    await ctx.api.editMessageReplyMarkup(sent.chat.id, sent.message_id, {
      reply_markup: mainMenuInline(),
    });

    if (ctx.from) await setSession(String(ctx.from.id), "idle");
  });
}
