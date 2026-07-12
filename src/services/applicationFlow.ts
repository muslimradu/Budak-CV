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
  formatWib,
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
  scheduledAt?: Date | null;
  status?: string | null;
  job: { position: string | null; company: string | null };
}): string {
  const to = app.toEmail ?? "belum ada — pakai /send email@domain.com";
  const lampiran = app.attachmentFilename ?? "CV.pdf";
  const kindLabel = app.kind === "followup" ? "Follow-up" : "Lamaran";
  const scheduleLine =
    app.status === "scheduled" && app.scheduledAt
      ? `Jadwal: ${formatWib(app.scheduledAt)}`
      : null;

  return joinBlocks(
    bold(`Draft #${app.id} · ${kindLabel}`),
    [
      `Posisi: ${escapeHtml(app.job.position ?? "—")}`,
      `Perusahaan: ${escapeHtml(app.job.company ?? "—")}`,
      `Kepada: ${code(to)}`,
      `Subject: ${escapeHtml(app.subject)}`,
      `Lampiran: ${code(lampiran)}`,
      scheduleLine,
    ]
      .filter(Boolean)
      .join("\n"),
    bold("Body"),
    escapeHtml(app.body),
    divider(),
    [
      `Kirim sekarang: balas ${code("YA")} atau ${code("KIRIM")}`,
      `Jadwal: ${code("/schedule 18:00")} atau ${code("/schedule 12/07/2026 18:00")}`,
      `Revisi: ${code("/revisi perusahaan")} · posisi · email · subject · body`,
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

export async function getApplicationForPreview(id: number) {
  return prisma.application.findUnique({
    where: { id },
    include: { job: true },
  });
}

export async function cancelPending(): Promise<boolean> {
  const pending = await getPendingApplication();
  if (!pending) return false;

  await prisma.application.update({
    where: { id: pending.id },
    data: { status: "cancelled", scheduledAt: null },
  });
  await audit("cancel", "User membatalkan draft", pending.id);
  return true;
}

export async function schedulePending(
  at: Date,
): Promise<
  | { ok: true; applicationId: number; at: Date; to: string }
  | { ok: false; reason: string }
> {
  const pending = await getPendingApplication();
  if (!pending) {
    return {
      ok: false,
      reason: "Tidak ada draft pending. Jalankan /draft dulu.",
    };
  }
  const toEmail = pending.toEmail?.trim();
  if (!toEmail) {
    return {
      ok: false,
      reason: "Email tujuan belum ada. Set dulu: /revisi email atau /send …",
    };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail)) {
    return { ok: false, reason: "Format email tujuan tidak valid." };
  }
  if (at.getTime() <= Date.now() + 30_000) {
    return { ok: false, reason: "Waktu jadwal harus di masa depan." };
  }

  await prisma.application.update({
    where: { id: pending.id },
    data: { status: "scheduled", scheduledAt: at, toEmail },
  });
  await audit(
    "schedule",
    `Dijadwalkan ${at.toISOString()} ke ${toEmail}`,
    pending.id,
  );

  return {
    ok: true,
    applicationId: pending.id,
    at,
    to: toEmail,
  };
}

export async function cancelScheduled(
  applicationId?: number,
): Promise<number> {
  if (applicationId) {
    const app = await prisma.application.findFirst({
      where: { id: applicationId, status: "scheduled" },
    });
    if (!app) return 0;
    await prisma.application.update({
      where: { id: app.id },
      data: { status: "cancelled", scheduledAt: null },
    });
    await audit("schedule_cancel", "Jadwal dibatalkan", app.id);
    return 1;
  }

  const apps = await prisma.application.findMany({
    where: { status: "scheduled" },
  });
  for (const app of apps) {
    await prisma.application.update({
      where: { id: app.id },
      data: { status: "cancelled", scheduledAt: null },
    });
    await audit("schedule_cancel", "Jadwal dibatalkan", app.id);
  }
  return apps.length;
}

export async function listScheduledApplications(limit = 10) {
  return prisma.application.findMany({
    where: { status: "scheduled" },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    include: { job: true },
  });
}

export async function sendApplicationById(
  applicationId: number,
  opts?: { toEmail?: string },
): Promise<
  { ok: true; messageId: string; to: string } | { ok: false; reason: string }
> {
  const pending = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: true },
  });
  if (!pending) {
    return { ok: false, reason: "Draft tidak ditemukan." };
  }
  if (!["pending_confirm", "scheduled"].includes(pending.status)) {
    return {
      ok: false,
      reason: `Status draft tidak bisa dikirim (${pending.status}).`,
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
        scheduledAt: null,
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
  return sendApplicationById(pending.id, opts);
}

export async function processDueScheduledSends(): Promise<
  Array<{ applicationId: number; result: Awaited<ReturnType<typeof sendApplicationById>> }>
> {
  const due = await prisma.application.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lte: new Date() },
    },
    orderBy: { scheduledAt: "asc" },
    take: 5,
  });

  const results: Array<{
    applicationId: number;
    result: Awaited<ReturnType<typeof sendApplicationById>>;
  }> = [];

  for (const app of due) {
    const result = await sendApplicationById(app.id);
    results.push({ applicationId: app.id, result });
  }
  return results;
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
