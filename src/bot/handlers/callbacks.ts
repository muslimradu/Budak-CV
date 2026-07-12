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
  formatDraftPreview,
  getApplicationForPreview,
  getPendingApplication,
  listScheduledApplications,
} from "../../services/applicationFlow.js";
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
  withMainMenu,
} from "../keyboard.js";
import { clearSession, setSession } from "../session.js";
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
  applicationId: number,
): Promise<void> {
  const app = await getApplicationForPreview(applicationId);
  if (!app) {
    await ctx.reply(
      joinBlocks(bold("Ups"), "Draft-nya nggak ketemu."),
      withMainMenu(replyHtml),
    );
    return;
  }
  const preview = formatDraftPreview(app);
  await ctx.reply(
    preview.length > 4000 ? preview.slice(0, 4000) + "\n…" : preview,
    withDraftInline(replyHtml),
  );
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
        bold("Belum ada draft"),
        "Buat draft dulu ya, baru kita revisi.",
      ),
      withMainMenu(replyHtml),
    );
    return;
  }

  const needsWait = ["company", "position", "email", "nama", "sapaan"].includes(
    field,
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
      updates: { [field]: value },
    });
    await clearSession(telegramId);
    const labels = changed.map((f) => REVISI_FIELD_LABELS[f]).join(", ");
    await ctx.reply(
      joinBlocks(
        bold("Sudah diubah"),
        `Yang berubah: ${escapeHtml(labels)}`,
        "Cek lagi draft-nya di bawah ya:",
      ),
      replyHtml,
    );
    await replyPreview(ctx, applicationId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    await ctx.reply(
      joinBlocks(bold("Revisi gagal"), msg),
      withMainMenu(replyHtml),
    );
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
          withMainMenu(replyHtml),
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
      await clearSession(telegramId);
      const cancelled = await cancelPending();
      await ctx.reply(
        cancelled
          ? joinBlocks(bold("Oke, dibatalin"), "Draft kamu sudah aku buang.")
          : joinBlocks(bold("Hmm"), "Nggak ada draft yang perlu dibatalin."),
        withMainMenu(replyHtml),
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
        withMainMenu(replyHtml),
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
            bold("Belum ada draft"),
            "Buat draft dulu ya, baru kita revisi.",
          ),
          withMainMenu(replyHtml),
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
        withMainMenu(replyHtml),
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
