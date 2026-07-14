import { z } from "zod";
import { chatJson } from "./client.js";
import type { CvProfile } from "./extractCv.js";
import { finalizeEmailBody } from "../utils/emailBody.js";
import type { ContentLanguage } from "../utils/language.js";

const reviseSchema = z.object({
  body: z.string().min(40),
});

const SYSTEM = `You revise an existing job application email BODY based on the user's instruction.
Return ONLY valid JSON: { "body": "..." }

Rules:
- Apply the instruction carefully to currentBody (edit / replace / remove / rephrase as asked).
- Keep the same language as currentBody (id or en). input.language is authoritative if unclear.
- Keep formal job-application tone.
- Use ONLY facts from the candidate CV. NEVER invent employers, tools, or experience not in the CV.
- If the instruction asks to swap A for B, remove A and write about B using CV facts only. If B is not in the CV, write honestly from the closest matching CV experience — do not fabricate.
- Preserve greeting and closing/sign-off/name structure unless the instruction asks to change them.
- body must be plain text: paragraphs separated by a blank line; each paragraph is ONE continuous line (spaces only, no soft wraps inside a paragraph).
- No markdown, no bullets, no Subject/To headers.`;

export async function reviseEmailBody(input: {
  currentBody: string;
  instruction: string;
  language: ContentLanguage;
  position?: string | null;
  company?: string | null;
  cv: CvProfile;
}): Promise<string> {
  const fullName =
    (input.cv.fullName ?? "").trim() ||
    (input.language === "en" ? "Applicant" : "Pelamar");

  const user = JSON.stringify(
    {
      language: input.language,
      instruction: input.instruction.trim(),
      currentBody: input.currentBody,
      position: input.position ?? null,
      company: input.company ?? null,
      candidate: {
        fullName,
        headline: input.cv.headline,
        summary: input.cv.summary,
        skills: input.cv.skills,
        experienceHighlights: input.cv.experienceHighlights,
        yearsExperience: input.cv.yearsExperience ?? null,
      },
    },
    null,
    2,
  );

  const content = await chatJson(SYSTEM, user);
  const parsed = reviseSchema.parse(JSON.parse(content) as unknown);

  return finalizeEmailBody(parsed.body, [
    input.position,
    input.company,
    fullName,
    ...(input.cv.headline ? [input.cv.headline] : []),
  ]);
}
