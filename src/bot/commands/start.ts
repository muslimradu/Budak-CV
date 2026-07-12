import type { Bot } from "grammy";
import { env } from "../../config.js";
import { setSession } from "../session.js";
import { bold, code, divider, joinBlocks, replyHtml } from "../format.js";
import { withMainMenu } from "../keyboard.js";

export function registerStartCommand(bot: Bot): void {
  bot.command("start", async (ctx) => {
    const text = joinBlocks(
      `${bold("BudakCV")} — bot lamaran kerja via Gmail`,
      [
        bold("Alur"),
        `1. Tombol ${code("📄 CV")} — upload PDF CV`,
        "2. Kirim lowongan (teks / PDF / foto)",
        `3. Tombol ${code("✉️ Draft")} — buat email`,
        `4. ${code("/revisi sapaan: Mbak")} — ubah draft`,
        `5. Tombol ${code("✅ Ya, kirim")} / ${code("📅 Jadwal")}`,
      ].join("\n"),
      [
        bold("Menu"),
        "Pakai tombol di bawah layar (seperti menu grid).",
        "Perintah slash tetap bisa dipakai.",
      ].join("\n"),
      [
        divider(),
        "Email tidak pernah terkirim tanpa konfirmasi.",
        `Batas: ${env.MAX_EMAILS_PER_DAY} email/hari.`,
      ].join("\n"),
    );

    await ctx.reply(text, withMainMenu(replyHtml));
    if (ctx.from) await setSession(String(ctx.from.id), "idle");
  });
}
