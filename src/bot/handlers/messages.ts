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
  getApplicationForPreview,
} from "../../services/applicationFlow.js";
import {
  applyJobFieldUpdates,
  formatMissingFieldsPrompt,
  getMissingJobFields,
  parseJobFieldReply,
} from "../../services/jobComplete.js";
import { bold, code, escapeHtml, joinBlocks, replyHtml } from "../format.js";
import {
  deleteDraftPreviewMessage,
  sendDraftPreview,
} from "../draftPreview.js";
import {
  applyRevisiUpdates,
  REVISI_FIELD_LABELS,
} from "../../services/revisi.js";

async function downloadTelegramFile(
  bot: Bot,
  fileId: string,
): Promise<Buffer> {
  const file = await bot.api.getFile(fileId);
  if (!file.file_path) {
    throw new Error("Aku nggak bisa unduh file dari Telegram.");
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
    joinBlocks(bold("Sebentar…"), "Aku simpan & baca CV kamu."),
    replyHtml,
  );
  const saved = await saveDefaultCv(telegramId, buffer, originalFileName);
  await clearSession(telegramId);
  await ctx.reply(
    joinBlocks(
      bold("CV kamu sudah tersimpan"),
      [
        `Nama: ${saved.profile.fullName ?? "—"}`,
        `Lampiran: ${code(saved.attachmentFilename)}`,
      ].join("\n"),
      `Lanjut kirim lowongan, lalu pilih Buat Email dari /start atau ${code("/draft")}.`,
    ),
    replyHtml,
  );
}

async function replyAfterJobIngest(
  ctx: {
    reply: (text: string, extra?: object) => Promise<unknown>;
    from?: { id: number };
  },
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
  await ctx.reply(formatJobSummary(job), replyHtml);
}

export function registerMessageHandlers(bot: Bot): void {
  bot.on("message:photo", async (ctx) => {
    const telegramId = String(ctx.from!.id);
    const mode = await getSession(telegramId);
    if (mode === "awaiting_cv") {
      await ctx.reply(
        joinBlocks(bold("Upload CV"), "Kirim PDF ya, bukan foto."),
        replyHtml,
      );
      return;
    }
    if (mode === "awaiting_job_complete" || mode === "awaiting_followup") {
      await ctx.reply(
        joinBlocks(
          bold("Tunggu dulu"),
          "Selesaikan balasan teksnya dulu, atau ketik BATAL.",
        ),
        replyHtml,
      );
      return;
    }

    const photos = ctx.message.photo;
    const largest = photos[photos.length - 1];
    if (!largest) {
      await ctx.reply(
        joinBlocks(bold("Ups"), "Foto-nya nggak valid."),
        replyHtml,
      );
      return;
    }

    await ctx.reply(
      joinBlocks(bold("Sebentar…"), "Aku baca foto lowongan kamu."),
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
          bold("Format belum didukung"),
          "Kirim PDF (CV/lowongan) atau gambar JPG/PNG/WebP ya.",
        ),
        replyHtml,
      );
      return;
    }

    const mode = await getSession(telegramId);
    if (mode === "awaiting_job_complete" || mode === "awaiting_followup") {
      await ctx.reply(
        joinBlocks(
          bold("Tunggu dulu"),
          "Selesaikan balasan teksnya dulu, atau ketik BATAL.",
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
          joinBlocks(bold("Upload CV"), "Kirim file PDF ya."),
          replyHtml,
        );
        return;
      }

      if (imageType) {
        await ctx.reply(
          joinBlocks(bold("Sebentar…"), "Aku baca gambar lowongan kamu."),
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
        joinBlocks(bold("Sebentar…"), "Aku baca PDF lowongan kamu."),
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
    const upper = text.toUpperCase();
    const session = await getSessionState(telegramId);

    if (upper === "BATAL") {
      if (session.mode !== "idle") {
        await clearSession(telegramId);
        if (session.mode === "awaiting_cv") {
          await ctx.reply(
            joinBlocks(bold("Oke, dibatalin"), "Upload CV-nya aku batalkan."),
            replyHtml,
          );
          return;
        }
        if (session.mode === "awaiting_job_complete") {
          await ctx.reply(
            joinBlocks(
              bold("Oke, dibatalin"),
              "Pelengkapan data dihentikan. Lowongannya tetap tersimpan.",
            ),
            replyHtml,
          );
          return;
        }
        if (session.mode === "awaiting_followup") {
          await ctx.reply(
            joinBlocks(bold("Oke, dibatalin"), "Follow-up-nya aku batalkan."),
            replyHtml,
          );
          return;
        }
        if (session.mode === "awaiting_revisi_value") {
          await ctx.reply(
            joinBlocks(bold("Oke, dibatalin"), "Revisi-nya aku batalkan."),
            replyHtml,
          );
          return;
        }
      }
      await deleteDraftPreviewMessage(ctx, telegramId);
      const cancelled = await cancelPending();
      await ctx.reply(
        cancelled
          ? joinBlocks(bold("Oke, dibatalin"), "Email kamu sudah aku buang.")
          : joinBlocks(bold("Hmm"), "Nggak ada yang perlu dibatalin."),
        replyHtml,
      );
      return;
    }

    if (upper === "YA" || upper === "KIRIM") {
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
          replyHtml,
        );
      }
      return;
    }

    if (session.mode === "awaiting_cv") {
      await ctx.reply(
        joinBlocks(
          bold("Masih nunggu CV"),
          "Kirim PDF-nya, atau ketik BATAL.",
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
          joinBlocks(bold("Sesi habis"), "Buka Revisi lagi dari email ya."),
          replyHtml,
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
          joinBlocks(bold("Sebentar…"), "Aku update email kamu."),
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
            bold("Sudah diubah"),
            `Yang berubah: ${escapeHtml(labels)}`,
            "Cek lagi email-nya di bawah ya:",
          ),
          replyHtml,
        );
        const app = await getApplicationForPreview(id);
        if (app) {
          await sendDraftPreview(ctx, telegramId, app);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await ctx.reply(joinBlocks(bold("Revisi gagal"), msg), replyHtml);
      }
      return;
    }

    if (session.mode === "awaiting_job_complete") {
      const jobId = session.payload.jobId;
      const missing = session.payload.missing ?? [];
      if (!jobId || missing.length === 0) {
        await clearSession(telegramId);
        await ctx.reply(
          joinBlocks(
            bold("Sesi habis"),
            "Kirim ulang lowongan, atau cek /jobs.",
          ),
          replyHtml,
        );
        return;
      }

      const updates = parseJobFieldReply(text, missing);
      const stillMissing = missing.filter((k) => !updates[k]);

      if (Object.keys(updates).length === 0) {
        await ctx.reply(
          joinBlocks(
            bold("Formatnya belum pas"),
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
            bold("Sebagian sudah masuk"),
            "Masih kurang ini:",
            formatMissingFieldsPrompt(jobId, stillMissing),
          ),
          replyHtml,
        );
        return;
      }

      await clearSession(telegramId);
      await ctx.reply(
        joinBlocks(bold("Lengkap"), "Ini ringkasan lowongan kamu:"),
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
          joinBlocks(bold("Sesi habis"), "Jalankan /followup lagi ya."),
          replyHtml,
        );
        return;
      }
      if (text.length < 10) {
        await ctx.reply(
          joinBlocks(
            bold("Terlalu pendek"),
            "Jelaskan konteks follow-up-nya lebih jelas ya.",
          ),
          replyHtml,
        );
        return;
      }

      await ctx.reply(
        joinBlocks(bold("Sebentar…"), "Aku susun follow-up kamu."),
        replyHtml,
      );
      try {
        const app = await createFollowUpDraft(telegramId, appId, text);
        await clearSession(telegramId);
        await sendDraftPreview(ctx, telegramId, app);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        await ctx.reply(joinBlocks(bold("Gagal"), msg), replyHtml);
      }
      return;
    }

    if (text.length < 40) {
      await ctx.reply(
        joinBlocks(
          bold("Pesannya terlalu pendek"),
          "Kirim lowongan (teks / PDF / foto), atau buka /start.",
        ),
        replyHtml,
      );
      return;
    }

    await ctx.reply(
      joinBlocks(bold("Sebentar…"), "Aku proses teks lowongan kamu."),
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
