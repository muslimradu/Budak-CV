import { z } from "zod";
import { chatJson, type ImageInput } from "./client.js";

const extractedJobSchema = z.object({
  rawText: z.string().optional(),
  position: z.string().nullable(),
  company: z.string().nullable(),
  recruiterEmail: z
    .union([z.string().email(), z.null(), z.literal("")])
    .nullable()
    .catch(null)
    .transform((v) => (v === "" ? null : v)),
  emailSubject: z.string().nullable().optional().catch(null),
  keyRequirements: z.array(z.string()).default([]),
  language: z.enum(["id", "en"]).default("id"),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

const SYSTEM = `You extract structured fields from a job posting.
Return ONLY valid JSON with keys:
- rawText: string (full readable text of the posting; for images, transcribe all visible job text)
- position: string | null
- company: string | null
- recruiterEmail: string | null (valid email if present in the posting, else null)
- emailSubject: string | null (ONLY if the posting explicitly suggests an email subject / subject line to use when applying; else null — do not invent)
- keyRequirements: string[] (3-8 concise bullets of must-have requirements)
- language: "id" or "en" (primary language of the posting)

Be precise. Do not invent an email or subject if none is present. Do not overclaim skills.`;

function parseExtracted(content: string): ExtractedJob {
  const parsed = JSON.parse(content) as unknown;
  return extractedJobSchema.parse(parsed);
}

export async function extractJob(rawText: string): Promise<ExtractedJob> {
  const truncated =
    rawText.length > 12000 ? rawText.slice(0, 12000) : rawText;
  const content = await chatJson(
    SYSTEM,
    `Job posting text:\n\n${truncated}`,
  );
  const extracted = parseExtracted(content);
  if (!extracted.rawText) {
    return { ...extracted, rawText: truncated };
  }
  return extracted;
}

export async function extractJobFromImage(
  image: ImageInput,
): Promise<ExtractedJob> {
  const content = await chatJson(
    SYSTEM,
    "This image is a job posting (screenshot/photo). Transcribe the posting into rawText and extract the structured fields.",
    image,
  );
  const extracted = parseExtracted(content);
  if (!extracted.rawText || extracted.rawText.trim().length < 20) {
    throw new Error(
      "Tidak bisa membaca lowongan dari foto. Coba foto lebih jelas, atau kirim teks/PDF.",
    );
  }
  return extracted;
}
