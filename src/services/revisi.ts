import type { RevisiField } from "../bot/session.js";
import { prisma } from "../db/prisma.js";
import { draftEmail } from "../llm/draftEmail.js";
import type { ExtractedJob } from "../llm/extractJob.js";
import {
  resolveEmailLanguage,
  type EmailLanguagePref,
} from "../utils/language.js";
import {
  cleanRecipientName,
  nameFromEmailLocalPart,
  parseHonorific,
} from "../utils/recipientName.js";
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
  nama: "nama",
  name: "nama",
  penerima: "nama",
  recruiter: "nama",
  sapaan: "sapaan",
  honorific: "sapaan",
  title: "sapaan",
  gelar: "sapaan",
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
  nama: "nama penerima",
  sapaan: "sapaan",
  subject: "subject",
  body: "body email",
};

const REGEN_FIELDS: RevisiField[] = [
  "company",
  "position",
  "email",
  "nama",
  "sapaan",
];

export function parseRevisiField(raw: string): RevisiField | null {
  const key = raw.trim().toLowerCase();
  return ALIAS[key] ?? null;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Parse inline revisi args, e.g.
 * "sapaan: Mbak"
 * "nama: Dodit Mulyanto, sapaan: Mas, perusahaan: PT Angin Ribut"
 */
export function parseRevisiUpdates(
  raw: string,
): Partial<Record<RevisiField, string>> {
  const text = raw.trim();
  if (!text) return {};

  const keys = Object.keys(ALIAS).sort((a, b) => b.length - a.length);
  const keyAlt = keys.map(escapeRegExp).join("|");
  const re = new RegExp(`(${keyAlt})\\s*:\\s*`, "gi");
  const matches = [...text.matchAll(re)];
  if (matches.length === 0) return {};

  const result: Partial<Record<RevisiField, string>> = {};
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]!;
    const field = parseRevisiField(m[1] ?? "");
    if (!field) continue;
    const start = (m.index ?? 0) + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1]!.index! : text.length;
    const value = text
      .slice(start, end)
      .replace(/,\s*$/, "")
      .trim();
    if (value) result[field] = value;
  }
  return result;
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
    recruiterName: app.job.recruiterName,
    recruiterHonorific: parseHonorific(app.job.recruiterHonorific),
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
    recipientName: app.job.recruiterName,
    recipientHonorific: app.job.recruiterHonorific,
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

async function applyOneField(
  pending: {
    id: number;
    jobId: number;
  },
  field: RevisiField,
  rawValue: string,
): Promise<void> {
  const value = rawValue.trim();
  if (!value) throw new Error(`Nilai ${REVISI_FIELD_LABELS[field]} kosong.`);

  if (field === "company") {
    await prisma.jobPosting.update({
      where: { id: pending.jobId },
      data: { company: value },
    });
    return;
  }
  if (field === "position") {
    await prisma.jobPosting.update({
      where: { id: pending.jobId },
      data: { position: value },
    });
    return;
  }
  if (field === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new Error("Format email tidak valid.");
    }
    const inferredName = nameFromEmailLocalPart(value);
    await prisma.jobPosting.update({
      where: { id: pending.jobId },
      data: {
        recruiterEmail: value,
        recruiterName: inferredName,
      },
    });
    await prisma.application.update({
      where: { id: pending.id },
      data: { toEmail: value },
    });
    return;
  }
  if (field === "nama") {
    const name = cleanRecipientName(value);
    if (!name) {
      throw new Error(
        "Nama penerima tidak valid. Contoh: Budi Santoso (bukan Tim Rekrutmen).",
      );
    }
    await prisma.jobPosting.update({
      where: { id: pending.jobId },
      data: { recruiterName: name },
    });
    return;
  }
  if (field === "sapaan") {
    const lower = value.toLowerCase().trim();
    if (["hapus", "kosong", "none", "null", "-"].includes(lower)) {
      await prisma.jobPosting.update({
        where: { id: pending.jobId },
        data: { recruiterHonorific: null },
      });
      return;
    }
    const honorific = parseHonorific(value);
    if (!honorific) {
      throw new Error(
        "Sapaan tidak valid. Pilih: bapak · ibu · mas · mbak · mr · ms · mrs",
      );
    }
    await prisma.jobPosting.update({
      where: { id: pending.jobId },
      data: { recruiterHonorific: honorific },
    });
    return;
  }
  if (field === "subject") {
    await prisma.application.update({
      where: { id: pending.id },
      data: { subject: value },
    });
    return;
  }
  if (field === "body") {
    if (value.length < 20) {
      throw new Error("Body terlalu pendek.");
    }
    await prisma.application.update({
      where: { id: pending.id },
      data: { body: value },
    });
  }
}

export async function applyRevisiUpdates(input: {
  telegramId: string;
  applicationId: number;
  updates: Partial<Record<RevisiField, string>>;
}): Promise<{ applicationId: number; changed: RevisiField[] }> {
  const entries = (
    Object.entries(input.updates) as Array<[RevisiField, string]>
  ).filter(([, v]) => v.trim().length > 0);

  if (entries.length === 0) {
    throw new Error("Tidak ada field revisi yang valid.");
  }

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

  const changed: RevisiField[] = [];
  const regenNeeded = entries.some(([field]) => REGEN_FIELDS.includes(field));
  const subjectBody = entries.filter(
    ([field]) => field === "subject" || field === "body",
  );
  const others = entries.filter(
    ([field]) => field !== "subject" && field !== "body",
  );

  for (const [field, value] of others) {
    await applyOneField(pending, field, value);
    changed.push(field);
  }

  if (regenNeeded) {
    await regenerateDraftBody(input.telegramId, pending.id);
  }

  // Subject/body applied after regen so user overrides stick
  for (const [field, value] of subjectBody) {
    await applyOneField(pending, field, value);
    changed.push(field);
  }

  if (pending.status === "scheduled") {
    await prisma.application.update({
      where: { id: pending.id },
      data: { status: "pending_confirm", scheduledAt: null },
    });
  }

  return { applicationId: pending.id, changed };
}

/** @deprecated use applyRevisiUpdates */
export async function applyRevisiValue(input: {
  telegramId: string;
  applicationId: number;
  field: RevisiField;
  value: string;
}): Promise<{ applicationId: number }> {
  const result = await applyRevisiUpdates({
    telegramId: input.telegramId,
    applicationId: input.applicationId,
    updates: { [input.field]: input.value },
  });
  return { applicationId: result.applicationId };
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
