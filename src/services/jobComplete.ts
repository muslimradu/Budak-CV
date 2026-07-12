import { prisma } from "../db/prisma.js";
import type { JobFieldKey } from "../bot/session.js";
import { bold, code, joinBlocks } from "../bot/format.js";

const FIELD_LABELS: Record<JobFieldKey, string> = {
  position: "posisi",
  company: "perusahaan",
  recruiterEmail: "email",
};

export function getMissingJobFields(job: {
  position: string | null;
  company: string | null;
  recruiterEmail: string | null;
}): JobFieldKey[] {
  const missing: JobFieldKey[] = [];
  if (!job.position?.trim()) missing.push("position");
  if (!job.company?.trim()) missing.push("company");
  if (!job.recruiterEmail?.trim()) missing.push("recruiterEmail");
  return missing;
}

export function formatMissingFieldsPrompt(
  jobId: number,
  missing: JobFieldKey[],
): string {
  const examples = missing
    .map((key) => `${FIELD_LABELS[key]}: ...`)
    .join("\n");

  return joinBlocks(
    bold("Data belum lengkap"),
    `Lowongan ${code(`#${jobId}`)} masih kurang info.`,
    "Balas HANYA field yang kosong (satu baris per field):",
    code(examples),
    `Contoh:\n${code("posisi: QA Engineer\nperusahaan: Acme\nemail: hr@acme.com")}`,
    `Batal: ${code("BATAL")}`,
  );
}

export function parseJobFieldReply(
  text: string,
  missing: JobFieldKey[],
): Partial<Record<JobFieldKey, string>> {
  const result: Partial<Record<JobFieldKey, string>> = {};
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const alias: Record<string, JobFieldKey> = {
    posisi: "position",
    position: "position",
    jabatan: "position",
    perusahaan: "company",
    company: "company",
    email: "recruiterEmail",
    recruiteremail: "recruiterEmail",
    mail: "recruiterEmail",
  };

  for (const line of lines) {
    const m = line.match(/^([a-zA-Z_]+)\s*[:=]\s*(.+)$/);
    if (!m) continue;
    const key = alias[m[1].toLowerCase()];
    if (!key || !missing.includes(key)) continue;
    const value = m[2].trim();
    if (value) result[key] = value;
  }

  // Jika hanya email yang missing dan user kirim bare email
  if (
    missing.includes("recruiterEmail") &&
    !result.recruiterEmail &&
    lines.length === 1 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lines[0])
  ) {
    result.recruiterEmail = lines[0];
  }

  return result;
}

export async function applyJobFieldUpdates(
  jobId: number,
  updates: Partial<Record<JobFieldKey, string>>,
) {
  const data: {
    position?: string;
    company?: string;
    recruiterEmail?: string;
  } = {};
  if (updates.position) data.position = updates.position;
  if (updates.company) data.company = updates.company;
  if (updates.recruiterEmail) data.recruiterEmail = updates.recruiterEmail;

  return prisma.jobPosting.update({
    where: { id: jobId },
    data,
  });
}

export async function deleteJobById(jobId: number): Promise<boolean> {
  const job = await prisma.jobPosting.findFirst({
    where: { id: jobId, status: "active" },
  });
  if (!job) return false;

  await prisma.jobPosting.update({
    where: { id: jobId },
    data: { status: "archived" },
  });
  return true;
}

export async function deleteAllActiveJobs(): Promise<number> {
  const result = await prisma.jobPosting.updateMany({
    where: { status: "active" },
    data: { status: "archived" },
  });
  return result.count;
}

export async function getActiveJobById(jobId: number) {
  return prisma.jobPosting.findFirst({
    where: { id: jobId, status: "active" },
  });
}
