import { z } from "zod";
import { chatJson } from "./client.js";

const cvProfileSchema = z.object({
  fullName: z.string().nullable(),
  headline: z.string().nullable(),
  summary: z.string().nullable(),
  skills: z.array(z.string()).default([]),
  experienceHighlights: z.array(z.string()).default([]),
  yearsExperience: z.string().nullable().optional(),
});

export type CvProfile = z.infer<typeof cvProfileSchema>;

const SYSTEM = `You extract a candidate profile from CV / resume text.
Return ONLY valid JSON with keys:
- fullName: string | null (exact full name as on CV)
- headline: string | null (current title / role)
- summary: string | null (2-4 sentence professional summary grounded in the CV)
- skills: string[] (key skills, tools, stacks)
- experienceHighlights: string[] (3-6 factual bullets from work history; no invention)
- yearsExperience: string | null (e.g. "5+ years" if stated or clearly inferable, else null)

Be honest. Do not invent employers, titles, or skills not supported by the CV.`;

export async function extractCvProfile(cvText: string): Promise<CvProfile> {
  const truncated = cvText.length > 14000 ? cvText.slice(0, 14000) : cvText;
  const content = await chatJson(SYSTEM, `CV text:\n\n${truncated}`);
  return cvProfileSchema.parse(JSON.parse(content) as unknown);
}
