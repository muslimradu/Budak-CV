import { draftFollowUpEmail } from "../llm/draftFollowUp.js";
import { prisma } from "../db/prisma.js";
import { draftEmail } from "../llm/draftEmail.js";
import type { ExtractedJob } from "../llm/extractJob.js";
import { sendApplicationEmail } from "../gmail/send.js";
import { env } from "../config.js";
import { getCvContext, getDefaultCvBuffer } from "./cvStorage.js";
import { canSendEmail } from "./dailyLimit.js";
import {
  resolveEmailLanguage,
  type EmailLanguagePref,
} from "../utils/language.js";
import {
  bold,
  code,
  divider,
  escapeHtml,
  joinBlocks,
} from "../bot/format.js";

async function getEmailLanguagePref(
  telegramId: string,
): Promise<EmailLanguagePref> {
  const settings = await prisma.userSettings.findUnique({
    where: { telegramId },
    select: { emailLanguage: true },
  });
  const pref = settings?.emailLanguage;
  if (pref === "id" || pref === "en" || pref === "auto") return pref;
  return "auto";
}

async function audit(
  action: string,
  detail: string,
  applicationId?: number,
): Promise<void> {
  await prisma.auditLog.create({
    data: { action, detail, applicationId },
  });
}

export async function cancelPendingApplications(): Promise<number> {
  const result = await prisma.application.updateMany({
    where: { status: "pending_confirm" },
    data: { status: "cancelled" },
  });
  return result.count;
}

export async function createDraftApplication(
  telegramId: string,
  jobId?: number,
) {
  const cv = await getCvContext(telegramId);
  const emailLangPref = await getEmailLanguagePref(telegramId);

  const job = jobId
    ? await prisma.jobPosting.findFirst({
        where: { id: jobId, status: "active" },
      })
    : await prisma.jobPosting.findFirst({
        where: { status: "active" },
        orderBy: { createdAt: "desc" },
      });

  if (!job) {
    throw new Error(
      jobId
        ? `Lowongan #${jobId} tidak ditemukan / sudah dihapus.`
        : "Belum ada lowongan aktif. Kirim teks, PDF, atau foto lowongan dulu.",
    );
  }

  let requirements: string[] = [];
  try {
    requirements = JSON.parse(job.requirementsJson) as string[];
  } catch {
    requirements = [];
  }

  const language = resolveEmailLanguage(emailLangPref, job.language);

  const extracted: ExtractedJob = {
    position: job.position,
    company: job.company,
    recruiterEmail: job.recruiterEmail,
    emailSubject: job.emailSubject,
    keyRequirements: requirements,
    language,
  };

  const draft = await draftEmail({
    job: extracted,
    rawTextSnippet: job.rawText,
    cv: cv.profile,
    emailSubjectFromJob: job.emailSubject,
    language,
  });

  await cancelPendingApplications();

  const application = await prisma.application.create({
    data: {
      jobId: job.id,
      kind: "application",
      toEmail: job.recruiterEmail,
      subject: draft.subject,
      body: draft.body,
      attachmentFilename: cv.attachmentFilename,
      status: "pending_confirm",
    },
    include: { job: true },
  });

  return application;
}

export async function createFollowUpDraft(
  telegramId: string,
  fromApplicationId: number,
  followUpContext: string,
) {
  const cv = await getCvContext(telegramId);
  const emailLangPref = await getEmailLanguagePref(telegramId);
  const previous = await prisma.application.findUnique({
    where: { id: fromApplicationId },
    include: { job: true },
  });
  if (!previous) {
    throw new Error(`Lamaran #${fromApplicationId} tidak ditemukan.`);
  }

  const language = resolveEmailLanguage(emailLangPref, previous.job.language);

  const draft = await draftFollowUpEmail({
    language,
    position: previous.job.position,
    company: previous.job.company,
    previousSubject: previous.subject,
    followUpContext,
    cv: cv.profile,
  });

  await cancelPendingApplications();

  return prisma.application.create({
    data: {
      jobId: previous.jobId,
      kind: "followup",
      toEmail: previous.toEmail ?? previous.job.recruiterEmail,
      subject: draft.subject,
      body: draft.body,
      attachmentFilename: cv.attachmentFilename,
      status: "pending_confirm",
    },
    include: { job: true },
  });
}

export async function getLastSentApplication() {
  return prisma.application.findFirst({
    where: { status: "sent", kind: { in: ["application", "followup"] } },
    orderBy: { sentAt: "desc" },
    include: { job: true },
  });
}

export async function getApplicationById(id: number) {
  return prisma.application.findUnique({
    where: { id },
    include: { job: true },
  });
}

export function formatDraftPreview(app: {
  id: number;
  kind?: string | null;
  toEmail: string | null;
  subject: string;
  body: string;
  attachmentFilename?: string | null;
  job: { position: string | null; company: string | null };
}): string {
  const to = app.toEmail ?? "belum ada — pakai /send email@domain.com";
  const lampiran = app.attachmentFilename ?? "CV.pdf";
  const kindLabel = app.kind === "followup" ? "Follow-up" : "Lamaran";

  return joinBlocks(
    bold(`Draft #${app.id} · ${kindLabel}`),
    [
      `Posisi: ${escapeHtml(app.job.position ?? "—")}`,
      `Perusahaan: ${escapeHtml(app.job.company ?? "—")}`,
      `Kepada: ${code(to)}`,
      `Subject: ${escapeHtml(app.subject)}`,
      `Lampiran: ${code(lampiran)}`,
    ].join("\n"),
    bold("Body"),
    // Tanpa <pre>: wrap natural. Pengiriman pakai HTML di gmail/send.ts.
    escapeHtml(app.body),
    divider(),
    [
      `Kirim: balas ${code("YA")} atau ${code("KIRIM")}`,
      `Tanpa email: ${code("/send email@domain.com")}`,
      `Batal: ${code("BATAL")}`,
    ].join("\n"),
  );
}

export async function getPendingApplication() {
  return prisma.application.findFirst({
    where: { status: "pending_confirm" },
    orderBy: { createdAt: "desc" },
    include: { job: true },
  });
}

export async function cancelPending(): Promise<boolean> {
  const pending = await getPendingApplication();
  if (!pending) return false;

  await prisma.application.update({
    where: { id: pending.id },
    data: { status: "cancelled" },
  });
  await audit("cancel", "User membatalkan draft", pending.id);
  return true;
}

export async function confirmAndSend(opts?: {
  toEmail?: string;
}): Promise<
  { ok: true; messageId: string; to: string } | { ok: false; reason: string }
> {
  const pending = await getPendingApplication();
  if (!pending) {
    return {
      ok: false,
      reason:
        "Tidak ada draft yang menunggu konfirmasi. Jalankan /draft dulu.",
    };
  }

  const toEmail = (opts?.toEmail ?? pending.toEmail)?.trim();
  if (!toEmail) {
    return {
      ok: false,
      reason: "Email tujuan belum ada. Kirim: /send email@domain.com",
    };
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return { ok: false, reason: "Format email tidak valid." };
  }

  const limit = await canSendEmail();
  if (!limit.allowed) {
    await audit(
      "send_blocked_limit",
      `Limit harian tercapai (${limit.sentToday}/${limit.limit})`,
      pending.id,
    );
    return {
      ok: false,
      reason: `Batas harian tercapai (${limit.sentToday}/${limit.limit}). Coba lagi besok.`,
    };
  }

  if (opts?.toEmail) {
    await prisma.application.update({
      where: { id: pending.id },
      data: { toEmail },
    });
  }

  await audit("send_attempt", `Mencoba kirim ke ${toEmail}`, pending.id);

  try {
    const cvBuffer = await getDefaultCvBuffer(env.TELEGRAM_USER_ID);
    if (!cvBuffer) {
      return {
        ok: false,
        reason: "CV default tidak ditemukan. Upload ulang dengan /cv",
      };
    }

    const settings = await prisma.userSettings.findUnique({
      where: { telegramId: env.TELEGRAM_USER_ID },
      select: { gmailEmail: true },
    });

    const { messageId } = await sendApplicationEmail({
      to: toEmail,
      subject: pending.subject,
      body: pending.body,
      cvBuffer,
      attachmentFilename: pending.attachmentFilename ?? undefined,
      fromEmail: settings?.gmailEmail ?? undefined,
    });

    await prisma.application.update({
      where: { id: pending.id },
      data: {
        status: "sent",
        toEmail,
        gmailMessageId: messageId,
        sentAt: new Date(),
      },
    });

    await audit(
      "send_success",
      `Terkirim ke ${toEmail}, id=${messageId}`,
      pending.id,
    );

    return { ok: true, messageId, to: toEmail };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    await prisma.application.update({
      where: { id: pending.id },
      data: { status: "failed", toEmail },
    });
    await audit("send_failed", detail, pending.id);
    return { ok: false, reason: `Gagal mengirim email: ${detail}` };
  }
}

export async function listRecentApplications(limit = 10) {
  return prisma.application.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { job: true },
  });
}

export async function listActiveJobs(limit = 10) {
  return prisma.jobPosting.findMany({
    where: { status: "active" },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
