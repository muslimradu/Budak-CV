import type { Bot } from "grammy";
import { setSession } from "../session.js";
import {
  parseRevisiField,
  requirePendingForRevisi,
  revisiPrompt,
  REVISI_FIELD_LABELS,
} from "../../services/revisi.js";
import { bold, code, joinBlocks, replyHtml } from "../format.js";

export function registerRevisiCommand(bot: Bot): void {
  bot.command("revisi", async (ctx) => {
    const telegramId = String(ctx.from!.id);
    const arg = (ctx.match ?? "").toString().trim();

    if (!arg) {
      await ctx.reply(
        joinBlocks(
          bold("Revisi draft"),
          "Pilih field yang mau diubah:",
          [
            `${code("/revisi perusahaan")}`,
            `${code("/revisi posisi")}`,
            `${code("/revisi email")}`,
            `${code("/revisi subject")}`,
            `${code("/revisi body")}`,
          ].join("\n"),
          "Setelah Anda kirim nilai baru, bot akan menampilkan draft untuk konfirmasi ulang.",
        ),
        replyHtml,
      );
      return;
    }

    const field = parseRevisiField(arg);
    if (!field) {
      await ctx.reply(
        joinBlocks(
          bold("Field tidak dikenali"),
          `Contoh: ${code("/revisi perusahaan")}`,
        ),
        replyHtml,
      );
      return;
    }

    const pending = await requirePendingForRevisi();
    if (!pending) {
      await ctx.reply(
        joinBlocks(
          bold("Tidak ada draft"),
          `Buat draft dulu dengan ${code("/draft")}.`,
        ),
        replyHtml,
      );
      return;
    }

    await setSession(telegramId, "awaiting_revisi", {
      revisiApplicationId: pending.id,
      revisiField: field,
    });

    await ctx.reply(
      joinBlocks(
        bold(`Revisi ${REVISI_FIELD_LABELS[field]}`),
        `Draft ${code(`#${pending.id}`)}`,
        revisiPrompt(field),
        `Batal: ${code("BATAL")}`,
      ),
      replyHtml,
    );
  });
}
