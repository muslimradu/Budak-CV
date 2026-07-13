import type { Bot, Context } from "grammy";
import {
  applyRevisiUpdates,
  requirePendingForRevisi,
  REVISI_FIELD_LABELS,
  type RevisiField,
} from "../../services/revisi.js";
import {
  cancelPending,
  confirmAndSend,
  createDraftApplication,
  getApplicationForPreview,
  getPendingApplication,
  listScheduledApplications,
} from "../../services/applicationFlow.js";
import { deleteJobById } from "../../services/jobComplete.js";
import {
  bold,
  code,
  escapeHtml,
  formatWib,
  joinBlocks,
  replyHtml,
} from "../format.js";
import {
  Cb,
  labelForMenuCallback,
  sapaanInline,
  withDraftInline,
} from "../keyboard.js";
import { clearSession, setSession } from "../session.js";
import {
  deleteDraftPreviewMessage,
  sendDraftPreview,
} from "../draftPreview.js";
import { refreshJobsListAfterDelete } from "../jobsList.js";
import { handleMenuButton, showRevisiPicker } from "./menu.js";

const REVISI_FIELDS = new Set<string>([
  "company",
  "position",
  "email",
  "nama",
  "sapaan",
  "subject",
  "body",
]);

async function replyPreview(
  ctx: Context,
  telegramId: string,
  applicationId: number,
): Promise<void> {
  const app = await getApplicationForPreview(applicationId);
  if (!app) {
    await ctx.reply(
      joinBlocks(bold("Ups"), "Email-nya nggak ketemu."),
      replyHtml,
    );
    return;
  }
  await sendDraftPreview(ctx, telegramId, app);
}

async function applyFieldUpdate(
  ctx: Context,
  telegramId: string,
  field: RevisiField,
  value: string,
): Promise<void> {
  const pending = await requirePendingForRevisi();
  if (!pending) {
    await ctx.reply(
      joinBlocks(
        bold("Belum ada email"),
        "Buat email dulu ya, baru kita revisi.",
      ),
      replyHtml,
    );
    return;
  }

  const needsWait = ["company", "position", "email", "nama", "sapaan"].includes(
    field,
  );
  if (needsWait) {
    await ctx.reply(
      joinBlocks(bold("Sebentar…"), "Aku update email kamu."),
      replyHtml,
    );
  }

  try {
    const { applicationId, changed } = await applyRevisiUpdates({
      telegramId,
      applicationId: pending.id,
      updates: { [field]: value },
    });
    await clearSession(telegramId);
    const labels = changed.map((f) => REVISI_FIELD_LABELS[f]).join(", ");
    await ctx.reply(
      joinBlocks(
        bold("Sudah diubah"),
        `Yang berubah: ${escapeHtml(labels)}`,
        "Cek lagi email-nya di bawah ya:",
      ),
      replyHtml,
    );
    await replyPreview(ctx, telegramId, applicationId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(joinBlocks(bold("Revisi gagal"), msg), replyHtml);
  }
}

export function registerCallbackHandlers(bot: Bot): void {
  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const telegramId = String(ctx.from.id);

    await ctx.answerCallbackQuery();

    const menuLabel = labelForMenuCallback(data);
    if (menuLabel) {
      await handleMenuButton(ctx, menuLabel);
      return;
    }

    if (data.startsWith("j:d:")) {
      const jobId = Number(data.slice(4));
      if (!Number.isInteger(jobId) || jobId <= 0) return;

      await setSession(telegramId, "idle");
      await ctx.reply(
        joinBlocks(
          bold("Sebentar…"),
          `Aku susun email buat lowongan ${code(`#${jobId}`)}.`,
        ),
        replyHtml,
      );
      try {
        const app = await createDraftApplication(telegramId, jobId);
        await sendDraftPreview(ctx, telegramId, app);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await ctx.reply(joinBlocks(bold("Gagal buat email"), msg), replyHtml);
      }
      return;
    }

    if (data.startsWith("j:x:")) {
      const jobId = Number(data.slice(4));
      if (!Number.isInteger(jobId) || jobId <= 0) return;

      const ok = await deleteJobById(jobId);
      await refreshJobsListAfterDelete(
        ctx,
        telegramId,
        ok ? { ok: true, deletedJobId: jobId } : { ok: false },
      );
      return;
    }

    if (data === Cb.send) {
      await ctx.reply(
        joinBlocks(bold("Mengirim…"), "Tunggu sebentar ya."),
        replyHtml,
      );
      const result = await confirmAndSend();
      if (result.ok) {
        await ctx.reply(
          joinBlocks(
            bold("Sudah terkirim"),
            `Ke: ${code(result.to)}`,
            `ID: ${code(result.messageId)}`,
          ),
          replyHtml,
        );
      } else {
        await ctx.reply(
          joinBlocks(bold("Gagal kirim"), result.reason),
          withDraftInline(replyHtml),
        );
      }
      return;
    }

    if (data === Cb.cancel) {
      await deleteDraftPreviewMessage(ctx, telegramId);
      await clearSession(telegramId);
      const cancelled = await cancelPending();
      await ctx.reply(
        cancelled
          ? joinBlocks(bold("Oke, dibatalin"), "Email kamu sudah aku buang.")
          : joinBlocks(bold("Hmm"), "Nggak ada email yang perlu dibatalin."),
        replyHtml,
      );
      return;
    }

    if (data === Cb.schedule) {
      const items = await listScheduledApplications();
      const list =
        items.length === 0
          ? "Belum ada yang dijadwal."
          : items
              .map((a) => {
                const when = a.scheduledAt ? formatWib(a.scheduledAt) : "—";
                return `${code(`#${a.id}`)} → ${code(a.toEmail ?? "—")} · ${when}`;
              })
              .join("\n");
      await ctx.reply(
        joinBlocks(
          bold("Jadwal kamu"),
          list,
          [
            `Contoh: ${code("/schedule 18:00")}`,
            code("/schedule 12/07/2026 18:00"),
            code("/schedule +30m"),
            code("/schedule batal"),
          ].join("\n"),
        ),
        replyHtml,
      );
      return;
    }

    if (data === Cb.revisi || data === Cb.revisiBack) {
      await clearSession(telegramId);
      await showRevisiPicker(ctx);
      return;
    }

    if (data.startsWith("r:f:")) {
      const field = data.slice(4);
      if (!REVISI_FIELDS.has(field)) return;
      const revisiField = field as RevisiField;

      if (revisiField === "sapaan") {
        await ctx.reply(
          joinBlocks(bold("Pilih sapaan"), "Atau ketik sendiri kalau mau."),
          { ...replyHtml, reply_markup: sapaanInline() },
        );
        return;
      }

      const pending = await getPendingApplication();
      if (!pending) {
        await ctx.reply(
          joinBlocks(
            bold("Belum ada email"),
            "Buat email dulu ya, baru kita revisi.",
          ),
          replyHtml,
        );
        return;
      }

      await setSession(telegramId, "awaiting_revisi_value", {
        applicationId: pending.id,
        revisiField,
      });
      await ctx.reply(
        joinBlocks(
          bold(`Ubah ${REVISI_FIELD_LABELS[revisiField]}`),
          "Kirim nilai barunya sekarang ya.",
          `Batal? Ketik ${code("BATAL")}.`,
        ),
        replyHtml,
      );
      return;
    }

    if (data.startsWith("r:s:")) {
      const value = data.slice(4);
      if (!value) return;
      await applyFieldUpdate(ctx, telegramId, "sapaan", value);
      return;
    }
  });
}
