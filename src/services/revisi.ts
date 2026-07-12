import type { RevisiField } from "../bot/session.js";
import { prisma } from "../db/prisma.js";
import { draftEmail } from "../llm/draftEmail.js";
import type { ExtractedJob } from "../llm/extractJob.js";
import {
  resolveEmailLanguage,
  type EmailLanguagePref,
} from "../utils/language.js";
import { getCvContext } from "./cvStorage.js";

export type { RevisiField };

const ALIAS: Record<string, RevisiField> = {
  perusahaan: "company",
  company: "company",
  posisi: "position",
  position: "position",
  jabatan: "position",
  email: "email",
  kepada: "email",
  to: "email",
  mail: "email",
  subject: "subject",
  subjek: "subject",
  judul: "subject",
  body: "body",
  isi: "body",
  konten: "body",
};

export const REVISI_FIELD_LABELS: Record<RevisiField, string> = {
  company: "perusahaan",
  position: "posisi",
  email: "email tujuan",
  subject: "subject",
  body: "body email",
};

export function parseRevisiField(raw: string): RevisiField | null {
  const key = raw.trim().toLowerCase();
  return ALIAS[key] ?? null;
}

export function revisiPrompt(field: RevisiField): string {
  switch (field) {
    case "company":
      return "Kirim nama perusahaan yang baru:";
    case "position":
      return "Kirim nama posisi yang baru:";
    case "email":
      return "Kirim alamat email tujuan yang baru:";
    case "subject":
      return "Kirim subject email yang baru:";
    case "body":
      return "Kirim body email yang baru (teks lengkap):";
  }
}

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

async function regenerateDraftBody(
  telegramId: string,
  applicationId: number,
): Promise<void> {
  const app = await prisma.application.findUnique({
    where: { id: applicationId },
    include: { job: true },
  });
  if (!app) throw new Error("Draft tidak ditemukan.");

  const cv = await getCvContext(telegramId);
  const emailLangPref = await getEmailLanguagePref(telegramId);
  const language = resolveEmailLanguage(emailLangPref, app.job.language);

  let requirements: string[] = [];
  try {
    requirements = JSON.parse(app.job.requirementsJson) as string[];
  } catch {
    requirements = [];
  }

  const extracted: ExtractedJob = {
    position: app.job.position,
    company: app.job.company,
    recruiterEmail: app.job.recruiterEmail,
    emailSubject: app.job.emailSubject,
    keyRequirements: requirements,
    language,
  };

  const draft = await draftEmail({
    job: extracted,
    rawTextSnippet: app.job.rawText,
    cv: cv.profile,
    emailSubjectFromJob: app.job.emailSubject,
    language,
  });

  await prisma.application.update({
    where: { id: applicationId },
    data: {
      subject: draft.subject,
      body: draft.body,
      attachmentFilename: cv.attachmentFilename,
    },
  });
}

export async function applyRevisiValue(input: {
  telegramId: string;
  applicationId: number;
  field: RevisiField;
  value: string;
}): Promise<{ applicationId: number }> {
  const value = input.value.trim();
  if (!value) throw new Error("Nilai revisi kosong.");

  const pending = await prisma.application.findFirst({
    where: {
      id: input.applicationId,
      status: { in: ["pending_confirm", "scheduled"] },
    },
    include: { job: true },
  });
  if (!pending) {
    throw new Error("Draft tidak ditemukan / sudah tidak aktif.");
  }

  if (input.field === "company") {
    await prisma.jobPosting.update({
      where: { id: pending.jobId },
      data: { company: value },
    });
    await regenerateDraftBody(input.telegramId, pending.id);
  } else if (input.field === "position") {
    await prisma.jobPosting.update({
      where: { id: pending.jobId },
      data: { position: value },
    });
    await regenerateDraftBody(input.telegramId, pending.id);
  } else if (input.field === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error("Format email tidak valid.");
    }
    await prisma.jobPosting.update({
      where: { id: pending.jobId },
      data: { recruiterEmail: value },
    });
    await prisma.application.update({
      where: { id: pending.id },
      data: { toEmail: value },
    });
  } else if (input.field === "subject") {
    await prisma.application.update({
      where: { id: pending.id },
      data: { subject: value },
    });
  } else if (input.field === "body") {
    if (value.length < 20) {
      throw new Error("Body terlalu pendek.");
    }
    await prisma.application.update({
      where: { id: pending.id },
      data: { body: value },
    });
  }

  // Jika sebelumnya scheduled, kembali ke pending_confirm agar user konfirmasi ulang
  if (pending.status === "scheduled") {
    await prisma.application.update({
      where: { id: pending.id },
      data: { status: "pending_confirm", scheduledAt: null },
    });
  }

  return { applicationId: pending.id };
}

export async function requirePendingForRevisi() {
  const pending = await prisma.application.findFirst({
    where: { status: "pending_confirm" },
    orderBy: { createdAt: "desc" },
    include: { job: true },
  });
  if (pending) return pending;

  return prisma.application.findFirst({
    where: { status: "scheduled" },
    orderBy: { scheduledAt: "asc" },
    include: { job: true },
  });
}
