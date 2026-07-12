import type { Bot } from "grammy";
import {
  getSession,
  getSessionState,
  clearSession,
  setSession,
  looksLikeCvFileName,
} from "../session.js";
import { saveDefaultCv } from "../../services/cvStorage.js";
import {
  detectImageMediaType,
  extractTextFromPdf,
  formatJobSummary,
  ingestJobImage,
  ingestJobText,
} from "../../services/jobIngest.js";
import {
  cancelPending,
  confirmAndSend,
  createFollowUpDraft,
  formatDraftPreview,
} from "../../services/applicationFlow.js";
import {
  applyJobFieldUpdates,
  formatMissingFieldsPrompt,
  getMissingJobFields,
  parseJobFieldReply,
} from "../../services/jobComplete.js";
import { bold, code, escapeHtml, joinBlocks, replyHtml } from "../format.js";
import { handleMenuButton } from "./menu.js";
import { isMainMenuButton, withDraftInline, withMainMenu } from "../keyboard.js";
import {
  applyRevisiUpdates,
  REVISI_FIELD_LABELS,
} from "../../services/revisi.js";
import {
  formatDraftPreview,
  getApplicationForPreview,
} from "../../services/applicationFlow.js";

async function downloadTelegramFile(
  bot: Bot,
  fileId: string,
): Promise<Buffer> {
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) {
    throw new Error("Tidak bisa mengunduh file dari Telegram.");
  }
  const token = bot.token;
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Gagal unduh file: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function saveCvFromBuffer(
  ctx: { reply: (text: string, extra?: object) => Promise<unknown> },
  telegramId: string,
  buffer: Buffer,
  originalFileName?: string,
): Promise<void> {
  await ctx.reply(
    joinBlocks(bold("CV"), "Menyimpan & membaca profil…"),
    replyHtml,
  );
  const saved = await saveDefaultCv(telegramId, buffer, originalFileName);
  await clearSession(telegramId);
  await ctx.reply(
    joinBlocks(
      bold("CV tersimpan"),
      [
        `Nama: ${saved.profile.fullName ?? "—"}`,
        `Lampiran: ${code(saved.attachmentFilename)}`,
      ].join("\n"),
      `Lanjut: kirim lowongan, lalu tombol ${code("✉️ Draft")} atau ${code("/draft")}`,
    ),
    withMainMenu(replyHtml),
  );
}

async function replyAfterJobIngest(
  ctx: { reply: (text: string, extra?: object) => Promise<unknown>; from?: { id: number } },
  job: {
    id: number;
    position: string | null;
    company: string | null;
    recruiterEmail: string | null;
    emailSubject?: string | null;
    requirementsJson: string;
    language: string;
  },
): Promise<void> {
  const missing = getMissingJobFields(job);
  if (missing.length > 0) {
    await setSession(String(ctx.from!.id), "awaiting_job_complete", {
      jobId: job.id,
      missing,
    });
    await ctx.reply(formatJobSummary(job), replyHtml);
    await ctx.reply(formatMissingFieldsPrompt(job.id, missing), replyHtml);
    return;
  }
  await ctx.reply(formatJobSummary(job), withMainMenu(replyHtml));
}

export function registerMessageHandlers(bot: Bot): void {
  bot.on("message:photo", async (ctx) => {
    const telegramId = String(ctx.from!.id);
    const mode = await getSession(telegramId);
    if (mode === "awaiting_cv") {
      await ctx.reply(
        joinBlocks(bold("Upload CV"), "Kirim file PDF, bukan foto."),
        replyHtml,
      );
      return;
    }
    if (mode === "awaiting_job_complete" || mode === "awaiting_followup") {
      await ctx.reply(
        joinBlocks(
          bold("Mode aktif"),
          "Selesaikan dulu dengan balasan teks, atau ketik BATAL.",
        ),
        replyHtml,
      );
      return;
    }

    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    if (!largest) {
      await ctx.reply(joinBlocks(bold("Error"), "Foto tidak valid."), replyHtml);
      return;
    }

    await ctx.reply(
      joinBlocks(bold("Lowongan"), "Membaca foto…"),
      replyHtml,
    );
    try {
      const buffer = await downloadTelegramFile(bot, largest.file_id);
      const { job } = await ingestJobImage({
        mediaType: "image/jpeg",
        dataBase64: buffer.toString("base64"),
      });
      await replyAfterJobIngest(ctx, job);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(joinBlocks(bold("Gagal"), msg), replyHtml);
    }
  });

  bot.on("message:document", async (ctx) => {
    const doc = ctx.message.document;
    const telegramId = String(ctx.from!.id);
    const mime = doc.mime_type ?? "";
    const name = doc.file_name ?? "";
    const nameLower = name.toLowerCase();
    const isPdf = mime === "application/pdf" || nameLower.endsWith(".pdf");
    const imageType = detectImageMediaType(mime, name);

    if (!isPdf && !imageType) {
      await ctx.reply(
        joinBlocks(
          bold("Format tidak didukung"),
          "Kirim PDF (CV/lowongan) atau gambar (JPG/PNG/WebP).",
        ),
        replyHtml,
      );
      return;
    }

    const mode = await getSession(telegramId);
    if (mode === "awaiting_job_complete" || mode === "awaiting_followup") {
      await ctx.reply(
        joinBlocks(
          bold("Mode aktif"),
          "Selesaikan dulu dengan balasan teks, atau ketik BATAL.",
        ),
        replyHtml,
      );
      return;
    }

    const treatAsCv =
      isPdf && (mode === "awaiting_cv" || looksLikeCvFileName(name));

    try {
      const buffer = await downloadTelegramFile(bot, doc.file_id);

      if (treatAsCv) {
        await saveCvFromBuffer(ctx, telegramId, buffer, name || undefined);
        return;
      }

      if (mode === "awaiting_cv" && !isPdf) {
        await ctx.reply(
          joinBlocks(bold("Upload CV"), "Kirim file PDF."),
          replyHtml,
        );
        return;
      }

      if (imageType) {
        await ctx.reply(
          joinBlocks(bold("Lowongan"), "Membaca gambar…"),
          replyHtml,
        );
        const { job } = await ingestJobImage({
          mediaType: imageType,
          dataBase64: buffer.toString("base64"),
        });
        await replyAfterJobIngest(ctx, job);
        return;
      }

      await ctx.reply(
        joinBlocks(bold("Lowongan"), "Membaca PDF…"),
        replyHtml,
      );
      const text = await extractTextFromPdf(buffer);
      const { job } = await ingestJobText(text);
      await replyAfterJobIngest(ctx, job);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(joinBlocks(bold("Gagal"), msg), replyHtml);
    }
  });

  bot.on("message:text", async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith("/")) return;

    const telegramId = String(ctx.from!.id);

    if (isMainMenuButton(text)) {
      const handled = await handleMenuButton(ctx, text);
      if (handled) return;
    }

    const upper = text.toUpperCase();
    const session = await getSessionState(telegramId);

    if (upper === "BATAL") {
      if (session.mode !== "idle") {
        await clearSession(telegramId);
        if (session.mode === "awaiting_cv") {
          await ctx.reply(
            joinBlocks(bold("Dibatalkan"), "Upload CV dibatalkan."),
            withMainMenu(replyHtml),
          );
          return;
        }
        if (session.mode === "awaiting_job_complete") {
          await ctx.reply(
            joinBlocks(
              bold("Dibatalkan"),
              "Pelengkapan data lowongan dibatalkan. Lowongan tetap tersimpan.",
            ),
            withMainMenu(replyHtml),
          );
          return;
        }
        if (session.mode === "awaiting_followup") {
          await ctx.reply(
            joinBlocks(bold("Dibatalkan"), "Follow-up dibatalkan."),
            withMainMenu(replyHtml),
          );
          return;
        }
        if (session.mode === "awaiting_revisi_value") {
          await ctx.reply(
            joinBlocks(bold("Dibatalkan"), "Revisi dibatalkan."),
            withMainMenu(replyHtml),
          );
          return;
        }
      }
      const cancelled = await cancelPending();
      await ctx.reply(
        cancelled
          ? joinBlocks(bold("Dibatalkan"), "Draft dibatalkan.")
          : joinBlocks(bold("Info"), "Tidak ada yang dibatalkan."),
        withMainMenu(replyHtml),
      );
      return;
    }

    if (upper === "YA" || upper === "KIRIM") {
      await ctx.reply(joinBlocks(bold("Mengirim"), "Mohon tunggu…"), replyHtml);
      const result = await confirmAndSend();
      if (result.ok) {
        await ctx.reply(
          joinBlocks(
            bold("Terkirim"),
            `Kepada: ${code(result.to)}`,
            `Message ID: ${code(result.messageId)}`,
          ),
          withMainMenu(replyHtml),
        );
      } else {
        await ctx.reply(
          joinBlocks(bold("Gagal kirim"), result.reason),
          withMainMenu(replyHtml),
        );
      }
      return;
    }

    if (session.mode === "awaiting_cv") {
      await ctx.reply(
        joinBlocks(
          bold("Menunggu CV"),
          "Kirim dokumen PDF, atau ketik BATAL.",
        ),
        replyHtml,
      );
      return;
    }

    if (session.mode === "awaiting_revisi_value") {
      const field = session.payload.revisiField;
      const applicationId = session.payload.applicationId;
      if (!field || !applicationId) {
        await clearSession(telegramId);
        await ctx.reply(
          joinBlocks(bold("Sesi berakhir"), "Buka Revisi lagi dari draft."),
          withMainMenu(replyHtml),
        );
        return;
      }

      const needsWait = [
        "company",
        "position",
        "email",
        "nama",
        "sapaan",
      ].includes(field);
      if (needsWait) {
        await ctx.reply(
          joinBlocks(bold("Revisi"), "Memperbarui draft…"),
          replyHtml,
        );
      }

      try {
        const { applicationId: id, changed } = await applyRevisiUpdates({
          telegramId,
          applicationId,
          updates: { [field]: text },
        });
        await clearSession(telegramId);
        const labels = changed.map((f) => REVISI_FIELD_LABELS[f]).join(", ");
        await ctx.reply(
          joinBlocks(
            bold("Revisi tersimpan"),
            `Diubah: ${escapeHtml(labels)}`,
            "Konfirmasi ulang draft:",
          ),
          replyHtml,
        );
        const app = await getApplicationForPreview(id);
        if (app) {
          const preview = formatDraftPreview(app);
          await ctx.reply(
            preview.length > 4000 ? preview.slice(0, 4000) + "\n…" : preview,
            withDraftInline(replyHtml),
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await ctx.reply(
          joinBlocks(bold("Gagal revisi"), msg),
          withMainMenu(replyHtml),
        );
      }
      return;
    }

    if (session.mode === "awaiting_job_complete") {
      const jobId = session.payload.jobId;
      const missing = session.payload.missing ?? [];
      if (!jobId || missing.length === 0) {
        await clearSession(telegramId);
        await ctx.reply(
          joinBlocks(bold("Sesi berakhir"), "Kirim ulang lowongan atau /jobs."),
          replyHtml,
        );
        return;
      }

      const updates = parseJobFieldReply(text, missing);
      const stillMissing = missing.filter((k) => !updates[k]);

      if (Object.keys(updates).length === 0) {
        await ctx.reply(
          joinBlocks(
            bold("Format tidak dikenali"),
            formatMissingFieldsPrompt(jobId, missing),
          ),
          replyHtml,
        );
        return;
      }

      const job = await applyJobFieldUpdates(jobId, updates);

      if (stillMissing.length > 0) {
        await setSession(telegramId, "awaiting_job_complete", {
          jobId,
          missing: stillMissing,
        });
        await ctx.reply(
          joinBlocks(
            bold("Sebagian tersimpan"),
            "Masih ada field kosong:",
            formatMissingFieldsPrompt(jobId, stillMissing),
          ),
          replyHtml,
        );
        return;
      }

      await clearSession(telegramId);
      await ctx.reply(
        joinBlocks(
          bold("Data lengkap"),
          "Konfirmasi ulang lowongan:",
        ),
        replyHtml,
      );
      await ctx.reply(formatJobSummary(job), replyHtml);
      return;
    }

    if (session.mode === "awaiting_followup") {
      const appId = session.payload.followUpFromApplicationId;
      if (!appId) {
        await clearSession(telegramId);
        await ctx.reply(
          joinBlocks(bold("Sesi berakhir"), "Jalankan /followup lagi."),
          replyHtml,
        );
        return;
      }
      if (text.length < 10) {
        await ctx.reply(
          joinBlocks(
            bold("Terlalu pendek"),
            "Jelaskan konteks follow-up lebih jelas.",
          ),
          replyHtml,
        );
        return;
      }

      await ctx.reply(
        joinBlocks(bold("Follow-up"), "Menyusun draft…"),
        replyHtml,
      );
      try {
        const app = await createFollowUpDraft(telegramId, appId, text);
        await clearSession(telegramId);
        const preview = formatDraftPreview(app);
        await ctx.reply(
          preview.length > 4000 ? preview.slice(0, 4000) + "\n…" : preview,
          replyHtml,
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await ctx.reply(joinBlocks(bold("Gagal"), msg), replyHtml);
      }
      return;
    }

    if (text.length < 40) {
      await ctx.reply(
        joinBlocks(
          bold("Pesan terlalu pendek"),
          "Kirim lowongan (teks / PDF / foto), atau buka /start.",
        ),
        replyHtml,
      );
      return;
    }

    await ctx.reply(
      joinBlocks(bold("Lowongan"), "Memproses teks…"),
      replyHtml,
    );
    try {
      const { job } = await ingestJobText(text);
      await replyAfterJobIngest(ctx, job);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      await ctx.reply(joinBlocks(bold("Gagal"), msg), replyHtml);
    }
  });
}
