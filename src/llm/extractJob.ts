import { z } from "zod";
import { chatJson, type ImageInput } from "./client.js";
import { resolvePostingLanguage } from "../utils/language.js";
import {
  cleanRecipientName,
  nameFromEmailLocalPart,
  parseHonorific,
  splitHonorificFromName,
} from "../utils/recipientName.js";

const extractedJobSchema = z.object({
  rawText: z.string().optional(),
  position: z.string().nullable(),
  company: z.string().nullable(),
  recruiterEmail: z
    .union([z.string().email(), z.null(), z.literal("")])
    .nullable()
    .catch(null)
    .transform((v) => (v === "" ? null : v)),
  recruiterName: z.string().nullable().optional().catch(null),
  recruiterHonorific: z
    .enum(["bapak", "ibu", "mas", "mbak", "mr", "ms", "mrs"])
    .nullable()
    .optional()
    .catch(null),
  emailSubject: z.string().nullable().optional().catch(null),
  keyRequirements: z.array(z.string()).default([]),
  language: z.enum(["id", "en"]).optional(),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema> & {
  language: "id" | "en";
  recruiterName: string | null;
  recruiterHonorific: "bapak" | "ibu" | "mas" | "mbak" | "mr" | "ms" | "mrs" | null;
};

const SYSTEM = `You extract structured fields from a job posting.
Return ONLY valid JSON with keys:
- rawText: string (full readable text of the posting; for images, transcribe all visible job text)
- position: string | null
- company: string | null
- recruiterEmail: string | null (valid email if present in the posting, else null)
- recruiterName: string | null — the CONTACT PERSON's personal name if clearly stated (e.g. "Contact: Budi Santoso", "Send CV to Sarah Chen", "Attn: Andi"). Use a person's name only, WITHOUT titles like Bapak/Ibu/Mas/Mbak/Mr/Ms. If only a team/role is mentioned (HR Team, Hiring Manager, Tim Rekrutmen), return null. Do not invent a name.
- recruiterHonorific: one of "bapak"|"ibu"|"mas"|"mbak"|"mr"|"ms"|"mrs"|null — ONLY if the posting clearly uses that title for the contact (e.g. "Bapak Andi", "Ibu Siti", "Mas Budi", "Mbak Rina", "Mr. Smith", "Ms. Chen"). Otherwise null. Do not invent.
- emailSubject: string | null (ONLY if the posting explicitly suggests an email subject / subject line to use when applying; else null — do not invent)
- keyRequirements: string[] (3-8 concise bullets of must-have requirements)
- language: "id" or "en" — primary language of the posting body (English posting => "en", Indonesian => "id"). Do not guess "id" for English text.

Be precise. Do not invent an email, name, honorific, or subject if none is present. Do not overclaim skills.`;

function finalizeExtracted(
  extracted: z.infer<typeof extractedJobSchema>,
  fallbackText: string,
): ExtractedJob {
  const rawText = (extracted.rawText?.trim() || fallbackText).trim();
  const language = resolvePostingLanguage(rawText, extracted.language ?? null);

  const split = splitHonorificFromName(extracted.recruiterName);
  const recruiterName =
    split.name ??
    cleanRecipientName(extracted.recruiterName) ??
    nameFromEmailLocalPart(extracted.recruiterEmail) ??
    null;
  const recruiterHonorific =
    parseHonorific(extracted.recruiterHonorific) ?? split.honorific ?? null;

  return { ...extracted, rawText, language, recruiterName, recruiterHonorific };
}

function parseExtracted(content: string, fallbackText: string): ExtractedJob {
  const parsed = JSON.parse(content) as unknown;
  return finalizeExtracted(extractedJobSchema.parse(parsed), fallbackText);
}

export async function extractJob(rawText: string): Promise<ExtractedJob> {
  const truncated =
    rawText.length > 12000 ? rawText.slice(0, 12000) : rawText;
  const content = await chatJson(
    SYSTEM,
    `Job posting text:\n\n${truncated}`,
  );
  return parseExtracted(content, truncated);
}

export async function extractJobFromImage(
  image: ImageInput,
): Promise<ExtractedJob> {
  const content = await chatJson(
    SYSTEM,
    "This image is a job posting (screenshot/photo). Transcribe the posting into rawText and extract the structured fields.",
    image,
  );
  const extracted = parseExtracted(content, "");
  if (!extracted.rawText || extracted.rawText.trim().length < 20) {
    throw new Error(
      "Tidak bisa membaca lowongan dari foto. Coba foto lebih jelas, atau kirim teks/PDF.",
    );
  }
  return extracted;
}
