export type ContentLanguage = "id" | "en";
export type EmailLanguagePref = "auto" | "id" | "en";

const ID_MARKERS =
  /\b(dan|yang|dengan|untuk|adalah|pengalaman|lamaran|persyaratan|kualifikasi|perusahaan|posisi|dibutuhkan|mencari|sebagai|minimal|tahun|kami|anda|lowongan|bergabung|penempatan)\b/gi;

const EN_MARKERS =
  /\b(the|and|with|for|experience|requirements|qualifications|company|position|looking|seeking|years|responsibilities|responsibility|we are|job description|about the role|what you.?ll|you will|bachelor|remote|full[- ]time)\b/gi;

function countMatches(text: string, re: RegExp): number {
  return (text.match(re) ?? []).length;
}

export function detectLanguageFromText(text: string): ContentLanguage {
  const sample = text.slice(0, 8000);
  const idHits = countMatches(sample, ID_MARKERS);
  const enHits = countMatches(sample, EN_MARKERS);
  if (enHits > idHits) return "en";
  if (idHits > enHits) return "id";
  return enHits > 0 ? "en" : "id";
}

/** Combine LLM guess with text heuristic; strong text signal wins. */
export function resolvePostingLanguage(
  text: string,
  llmLang?: ContentLanguage | null,
): ContentLanguage {
  const sample = text.slice(0, 8000);
  const idHits = countMatches(sample, ID_MARKERS);
  const enHits = countMatches(sample, EN_MARKERS);

  if (enHits >= idHits + 2) return "en";
  if (idHits >= enHits + 2) return "id";
  if (llmLang === "id" || llmLang === "en") return llmLang;
  return detectLanguageFromText(text);
}

export function resolveEmailLanguage(
  pref: EmailLanguagePref | string | null | undefined,
  jobLanguage: string | null | undefined,
): ContentLanguage {
  if (pref === "id" || pref === "en") return pref;
  return jobLanguage === "en" ? "en" : "id";
}

export function formatLanguageLabel(lang: string): string {
  if (lang === "en") return "English (en)";
  if (lang === "id") return "Indonesia (id)";
  if (lang === "auto") return "Otomatis (ikuti lowongan)";
  return lang;
}
