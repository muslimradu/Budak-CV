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
  "Langsung isi field di perintah (bisa beberapa sekaligus):",
  [
    `${code("/revisi sapaan: Mbak")}`,
    `${code("/revisi nama: Dodit Mulyanto, sapaan: Mas")}`,
    `${code("/revisi nama: Dodit Mulyanto, sapaan: Mas, perusahaan: PT Angin Ribut")}`,
  ].join("\n"),
  [
    bold("Field"),
    "perusahaan · posisi · email · nama · sapaan · subject · body",
  ].join("\n"),
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
          bold("Format tidak dikenali"),
          `Contoh: ${code("/revisi sapaan: Mbak")}`,
          `Atau: ${code("/revisi nama: Dodit, sapaan: Mas, perusahaan: Acme")}`,
        ),
        withMainMenu(replyHtml),
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
        withMainMenu(replyHtml),
      );
      return;
    }

    const needsWait = Object.keys(updates).some((k) =>
      ["company", "position", "email", "nama", "sapaan"].includes(k),
    );
    if (needsWait) {
      await ctx.reply(
        joinBlocks(bold("Revisi"), "Memperbarui draft…"),
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
          joinBlocks(bold("Gagal"), "Draft tidak ditemukan setelah revisi."),
          replyHtml,
        );
        return;
      }

      const changedLabels = changed
        .map((f) => REVISI_FIELD_LABELS[f])
        .join(", ");

      await ctx.reply(
        joinBlocks(
          bold("Revisi tersimpan"),
          `Diubah: ${escapeHtml(changedLabels)}`,
          "Konfirmasi ulang draft:",
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
        joinBlocks(bold("Gagal revisi"), msg),
        withMainMenu(replyHtml),
      );
    }
  });
}
