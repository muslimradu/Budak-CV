import { z } from "zod";
import { chatJson } from "./client.js";
import type { CvProfile } from "./extractCv.js";
import { cleanParagraph, finalizeEmailBody } from "../utils/emailBody.js";

const partsSchema = z.object({
  greeting: z.string().min(1),
  opening: z.string().min(1),
  context: z.string().min(1),
  ask: z.string().min(1),
  closing: z.string().min(1),
  signOff: z.string().min(1),
});

function assembleBody(
  parts: z.infer<typeof partsSchema>,
  fullName: string,
  protectPhrases: Array<string | null | undefined>,
): string {
  const blocks = [
    cleanParagraph(parts.greeting),
    cleanParagraph(parts.opening),
    cleanParagraph(parts.context),
    cleanParagraph(parts.ask),
    cleanParagraph(parts.closing),
    cleanParagraph(parts.signOff),
    cleanParagraph(fullName),
  ].filter(Boolean);

  return finalizeEmailBody(blocks.join("\n\n"), protectPhrases);
}

const SYSTEM = `You write a formal follow-up email after a job application.
Return ONLY valid JSON with keys (each value = ONE continuous paragraph as a SINGLE LINE — never insert line breaks):
- greeting
- opening (reference previous application politely)
- context (incorporate the user's follow-up context; do not invent facts)
- ask (polite ask for status / next steps)
- closing
- signOff ("Hormat saya," or "Best regards,")

Rules:
- Keep multi-word titles intact (e.g. "QA Engineer")
- Match language (id/en) from input
- Formal, concise, no fluff, no overclaiming
- Never invent interview dates or promises not in the context
- No markdown, no Subject in body`;

export async function draftFollowUpEmail(input: {
  language: "id" | "en";
  position: string | null;
  company: string | null;
  previousSubject: string;
  followUpContext: string;
  cv: CvProfile;
}): Promise<{ subject: string; body: string }> {
  const fullName = (input.cv.fullName ?? "").trim() || "Pelamar";
  const pos = input.position ?? "posisi yang dilamar";
  const company = input.company ? ` di ${input.company}` : "";

  const content = await chatJson(
    SYSTEM,
    JSON.stringify(
      {
        language: input.language,
        position: input.position,
        company: input.company,
        previousSubject: input.previousSubject,
        followUpContext: input.followUpContext,
        candidateName: fullName,
      },
      null,
      2,
    ),
  );

  const parts = partsSchema.parse(JSON.parse(content) as unknown);
  const body = assembleBody(parts, fullName, [
    input.position,
    input.company,
    fullName,
  ]);

  const subject =
    input.language === "en"
      ? `Follow-up: ${pos}${company ? ` — ${input.company}` : ""}`
      : `Follow-up Lamaran ${pos}${company} - ${fullName}`;

  return { subject, body };
}
