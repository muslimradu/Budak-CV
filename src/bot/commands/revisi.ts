import type { Bot } from "grammy";
import {
  applyRevisiUpdates,
  parseRevisiUpdates,
  requirePendingForRevisi,
  REVISI_FIELD_LABELS,
} from "../../services/revisi.js";
import {
  formatDraftPreview,
  getApplicationForPreview,
} from "../../services/applicationFlow.js";
import { bold, code, escapeHtml, joinBlocks, replyHtml } from "../format.js";
import { withDraftInline, withMainMenu } from "../keyboard.js";

const HELP = joinBlocks(
  bold("Revisi draft"),
  "Langsung tulis yang mau diubah, bisa sekaligus:",
  [
    code("/revisi sapaan: Mbak"),
    code("/revisi nama: Dodit, sapaan: Mas"),
    code("/revisi nama: Dodit, sapaan: Mas, perusahaan: PT Angin Ribut"),
  ].join("\n"),
  "Field: perusahaan · posisi · email · nama · sapaan · subject · body",
);

export function registerRevisiCommand(bot: Bot): void {
  bot.command("revisi", async (ctx) => {
    const telegramId = String(ctx.from!.id);
    const arg = (ctx.match ?? "").toString().trim();

    if (!arg) {
      await ctx.reply(HELP, withMainMenu(replyHtml));
      return;
    }

    const updates = parseRevisiUpdates(arg);
    if (Object.keys(updates).length === 0) {
      await ctx.reply(
        joinBlocks(
          bold("Formatnya belum pas"),
          `Coba kayak gini: ${code("/revisi sapaan: Mbak")}`,
        ),
        withMainMenu(replyHtml),
      );
      return;
    }

    const pending = await requirePendingForRevisi();
    if (!pending) {
      await ctx.reply(
        joinBlocks(
          bold("Belum ada draft"),
          "Buat draft dulu ya, baru kita revisi.",
        ),
        withMainMenu(replyHtml),
      );
      return;
    }

    const needsWait = Object.keys(updates).some((k) =>
      ["company", "position", "email", "nama", "sapaan"].includes(k),
    );
    if (needsWait) {
      await ctx.reply(
        joinBlocks(bold("Sebentar…"), "Aku update draft kamu."),
        replyHtml,
      );
    }

    try {
      const { applicationId, changed } = await applyRevisiUpdates({
        telegramId,
        applicationId: pending.id,
        updates,
      });
      const app = await getApplicationForPreview(applicationId);
      if (!app) {
        await ctx.reply(
          joinBlocks(bold("Ups"), "Draft-nya hilang setelah direvisi."),
          replyHtml,
        );
        return;
      }

      const changedLabels = changed
        .map((f) => REVISI_FIELD_LABELS[f])
        .join(", ");

      await ctx.reply(
        joinBlocks(
          bold("Sudah diubah"),
          `Yang berubah: ${escapeHtml(changedLabels)}`,
          "Cek lagi draft-nya di bawah ya:",
        ),
        replyHtml,
      );
      const preview = formatDraftPreview(app);
      await ctx.reply(
        preview.length > 4000 ? preview.slice(0, 4000) + "\n…" : preview,
        withDraftInline(replyHtml),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(
        joinBlocks(bold("Revisi gagal"), msg),
        withMainMenu(replyHtml),
      );
    }
  });
}
