import type { Bot } from "grammy";
import { env } from "../../config.js";
import { setSession } from "../session.js";
import { bold, code, divider, joinBlocks, replyHtml } from "../format.js";

export function registerStartCommand(bot: Bot): void {
  bot.command("start", async (ctx) => {
    const text = joinBlocks(
      `${bold("BudakCV")} — bot lamaran kerja via Gmail`,
      [
        bold("Alur"),
        `1. ${code("/cv")} — upload PDF CV`,
        "2. Kirim lowongan (teks / PDF / foto)",
        `3. ${code("/draft")} atau ${code("/draft 3")} — buat email`,
        `4. Balas ${code("YA")} / ${code("KIRIM")} untuk mengirim`,
      ].join("\n"),
      [
        bold("Perintah lain"),
        `${code("/jobs")} — daftar lowongan`,
        `${code("/delete")} / ${code("/delete 3")} / ${code("/delete all")}`,
        `${code("/status")} — riwayat lamaran`,
        `${code("/followup")} — draft follow-up`,
        `${code("/lang")} — bahasa email (auto / en / id)`,
        `${code("/send email@x.com")} — kirim ke email tertentu`,
        `${code("BATAL")} — batalkan mode / draft`,
      ].join("\n"),
      [
        divider(),
        "Jika data lowongan kurang lengkap, bot akan minta Anda melengkapi.",
        "Email tidak pernah terkirim tanpa konfirmasi.",
        `Batas: ${env.MAX_EMAILS_PER_DAY} email/hari.`,
      ].join("\n"),
    );

    await ctx.reply(text, replyHtml);
    if (ctx.from) await setSession(String(ctx.from.id), "idle");
  });
}
