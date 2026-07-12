import { createRequire } from "node:module";
import { prisma } from "../db/prisma.js";
import {
  extractJob,
  extractJobFromImage,
  type ExtractedJob,
} from "../llm/extractJob.js";
import type { ImageInput } from "../llm/client.js";
import { bold, code, escapeHtml, joinBlocks } from "../bot/format.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse") as (
  data: Buffer,
) => Promise<{ text: string }>;

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  const text = (result.text ?? "").trim();
  if (!text) {
    throw new Error("PDF tidak berisi teks yang bisa dibaca.");
  }
  return text;
}

async function persistJob(rawText: string, extracted: ExtractedJob) {
  const job = await prisma.jobPosting.create({
    data: {
      rawText,
      position: extracted.position,
      company: extracted.company,
      recruiterEmail: extracted.recruiterEmail,
      emailSubject: extracted.emailSubject ?? null,
      requirementsJson: JSON.stringify(extracted.keyRequirements),
      language: extracted.language,
      status: "active",
    },
  });
  return { job, extracted };
}

export async function ingestJobText(rawText: string) {
  const cleaned = rawText.trim();
  if (cleaned.length < 20) {
    throw new Error(
      "Teks lowongan terlalu pendek. Kirim deskripsi yang lebih lengkap.",
    );
  }

  const extracted = await extractJob(cleaned);
  return persistJob(extracted.rawText?.trim() || cleaned, extracted);
}

export async function ingestJobImage(image: ImageInput) {
  const extracted = await extractJobFromImage(image);
  const rawText = extracted.rawText!.trim();
  return persistJob(rawText, extracted);
}

export function detectImageMediaType(
  mime?: string,
  fileName?: string,
): ImageInput["mediaType"] | null {
  const lowerMime = (mime ?? "").toLowerCase();
  const name = (fileName ?? "").toLowerCase();

  if (lowerMime === "image/jpeg" || lowerMime === "image/jpg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg";
  }
  if (lowerMime === "image/png" || name.endsWith(".png")) {
    return "image/png";
  }
  if (lowerMime === "image/webp" || name.endsWith(".webp")) {
    return "image/webp";
  }
  if (lowerMime === "image/gif" || name.endsWith(".gif")) {
    return "image/gif";
  }
  return null;
}

export function formatJobSummary(job: {
  id: number;
  position: string | null;
  company: string | null;
  recruiterEmail: string | null;
  emailSubject?: string | null;
  requirementsJson: string;
  language: string;
}): string {
  let requirements: string[] = [];
  try {
    requirements = JSON.parse(job.requirementsJson) as string[];
  } catch {
    requirements = [];
  }

  const reqLines =
    requirements.length > 0
      ? requirements
          .map((r, i) => `${i + 1}. ${escapeHtml(r)}`)
          .join("\n")
      : "Tidak terdeteksi";

  return joinBlocks(
    bold(`Lowongan #${job.id} tersimpan`),
    [
      `Posisi: ${escapeHtml(job.position ?? "—")}`,
      `Perusahaan: ${escapeHtml(job.company ?? "—")}`,
      `Email: ${code(job.recruiterEmail ?? "tidak terdeteksi")}`,
      `Subject: ${escapeHtml(job.emailSubject ?? "otomatis [Posisi] - [Nama]")}`,
      `Bahasa: ${escapeHtml(job.language)}`,
    ].join("\n"),
    [bold("Requirement"), reqLines].join("\n"),
    `Lanjut: ${code("/draft")}`,
  );
}
