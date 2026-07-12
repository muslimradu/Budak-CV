import { z } from "zod";
import { chatJson } from "./client.js";
import type { ExtractedJob } from "./extractJob.js";
import type { CvProfile } from "./extractCv.js";
import { cleanParagraph, finalizeEmailBody } from "../utils/emailBody.js";
import type { ContentLanguage } from "../utils/language.js";

const draftPartsSchema = z.object({
  greeting: z.string().min(1),
  opening: z.string().min(1),
  experience: z.string().min(1),
  fit: z.string().min(1),
  closing: z.string().min(1),
  signOff: z.string().min(1),
});

export type DraftEmail = {
  subject: string;
  body: string;
};

function assembleBody(
  parts: z.infer<typeof draftPartsSchema>,
  fullName: string,
  protectPhrases: Array<string | null | undefined>,
): string {
  const blocks = [
    cleanParagraph(parts.greeting),
    cleanParagraph(parts.opening),
    cleanParagraph(parts.experience),
    cleanParagraph(parts.fit),
    cleanParagraph(parts.closing),
    cleanParagraph(parts.signOff),
    cleanParagraph(fullName),
  ].filter(Boolean);

  return finalizeEmailBody(blocks.join("\n\n"), protectPhrases);
}

function defaultSubject(
  language: ContentLanguage,
  position: string | null | undefined,
  fullName: string | null | undefined,
): string {
  const name = (fullName ?? "").trim();
  if (language === "en") {
    const pos = (position ?? "Job Application").trim() || "Job Application";
    return name ? `${pos} - ${name}` : pos;
  }
  const pos = (position ?? "Lamaran Kerja").trim() || "Lamaran Kerja";
  return name ? `${pos} - ${name}` : pos;
}

const SYSTEM = `You write formal job application email PARTS (not a full freeform letter).
Return ONLY valid JSON with keys (each value = ONE continuous paragraph as a SINGLE LINE of text — never insert line breaks, never wrap words):
- greeting
- opening: state interest in the position/company in 1-2 sentences
- experience: 1-2 sentences summarizing relevant background from the CV only
- fit: 1-2 sentences aligning CV skills/experience with 2-4 job requirements (honest, no overclaim)
- closing: mention CV is attached + polite availability
- signOff (no name here)

LANGUAGE (critical — input.language is authoritative):
- If language is "en": write EVERY part in English. greeting e.g. "Dear Hiring Manager,", signOff "Best regards,"
- If language is "id": write EVERY part in Indonesian. greeting e.g. "Yth. Tim Rekrutmen,", signOff "Hormat saya,"
- Do NOT mix Indonesian and English. Do NOT default to Indonesian when language is "en".

STRICT formatting:
- Each JSON string value must be a single line with spaces only (no \\n, no soft wraps)
- Keep multi-word titles intact on the same line, e.g. write "QA Engineer" not "QA" then newline then "Engineer"
- NEVER use "Yth. yang terhormat"
- NEVER invent skills/employers not in the CV
- No markdown, no bullets, no Subject/To headers`;

export async function draftEmail(input: {
  job: ExtractedJob;
  rawTextSnippet: string;
  cv: CvProfile;
  emailSubjectFromJob?: string | null;
  language: ContentLanguage;
}): Promise<DraftEmail> {
  const { job, rawTextSnippet, cv, emailSubjectFromJob, language } = input;
  const fullName = (cv.fullName ?? "").trim() || (language === "en" ? "Applicant" : "Pelamar");

  const user = JSON.stringify(
    {
      language,
      languageInstruction:
        language === "en"
          ? "Write the entire email in English."
          : "Tulis seluruh email dalam Bahasa Indonesia.",
      position: job.position,
      company: job.company,
      keyRequirements: job.keyRequirements,
      postingSnippet: rawTextSnippet.slice(0, 2500),
      candidate: {
        fullName,
        headline: cv.headline,
        summary: cv.summary,
        skills: cv.skills,
        experienceHighlights: cv.experienceHighlights,
        yearsExperience: cv.yearsExperience ?? null,
      },
    },
    null,
    2,
  );

  const content = await chatJson(SYSTEM, user);
  const parts = draftPartsSchema.parse(JSON.parse(content) as unknown);
  const body = assembleBody(parts, fullName, [
    job.position,
    job.company,
    fullName,
    ...(cv.headline ? [cv.headline] : []),
  ]);

  const subjectFromJob = emailSubjectFromJob?.trim();
  const subject =
    subjectFromJob && subjectFromJob.length > 0
      ? subjectFromJob
      : defaultSubject(language, job.position, fullName);

  return { subject, body };
}
