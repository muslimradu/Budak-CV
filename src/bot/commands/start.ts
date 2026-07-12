import type { Bot } from "grammy";
import { env } from "../../config.js";
import { setSession } from "../session.js";
import { bold, code, joinBlocks, replyHtml } from "../format.js";
import { removeReplyKeyboard, withMainMenu } from "../keyboard.js";

export function registerStartCommand(bot: Bot): void {
  bot.command("start", async (ctx) => {
    const text = joinBlocks(
      `${bold("Halo, aku Budak")}\nAku bantu kamu lamar kerja lewat Gmail.`,
      [
        bold("Caranya gampang"),
        `1. Upload CV kamu`,
        `2. Kirim lowongan (teks / PDF / foto)`,
        `3. Minta aku buatkan email`,
        `4. Cek dulu, baru kirim / revisi / jadwal`,
      ].join("\n"),
      `Pilih menu di bawah ya. Butuh aku lagi? Ketik ${code("/start")}.`,
      `Tenang, email cuma terkirim kalau kamu bilang oke.\nBatas ${env.MAX_EMAILS_PER_DAY} email/hari.`,
    );

    // Hapus reply-keyboard lama (kalau masih ada), tanpa mengganggu pesan welcome.
    try {
      const clearer = await ctx.reply("\u200b", {
        reply_markup: removeReplyKeyboard,
      });
      await ctx.api.deleteMessage(clearer.chat.id, clearer.message_id);
    } catch {
      // Abaikan jika client tidak mendukung / pesan sudah terhapus.
    }

    await ctx.reply(text, withMainMenu(replyHtml));

    if (ctx.from) await setSession(String(ctx.from.id), "idle");
  });
}
