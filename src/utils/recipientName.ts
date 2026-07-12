/** Infer / normalize recipient names + honorifics for email greetings. */

export type RecipientHonorific =
  | "bapak"
  | "ibu"
  | "mas"
  | "mbak"
  | "mr"
  | "ms"
  | "mrs";

const GENERIC_LOCAL_PARTS = new Set([
  "hr",
  "hrs",
  "recruitment",
  "rekrutmen",
  "recruiter",
  "careers",
  "career",
  "jobs",
  "job",
  "apply",
  "application",
  "applications",
  "talent",
  "people",
  "hiring",
  "info",
  "contact",
  "hello",
  "admin",
  "office",
  "team",
  "support",
  "noreply",
  "no-reply",
  "donotreply",
  "mail",
  "email",
]);

const HONORIFIC_ALIASES: Record<string, RecipientHonorific> = {
  bapak: "bapak",
  pak: "bapak",
  bp: "bapak",
  bpk: "bapak",
  ibu: "ibu",
  bu: "ibu",
  mas: "mas",
  mbak: "mbak",
  mba: "mbak",
  mb: "mbak",
  mr: "mr",
  "mr.": "mr",
  mister: "mr",
  ms: "ms",
  "ms.": "ms",
  miss: "ms",
  mrs: "mrs",
  "mrs.": "mrs",
  missus: "mrs",
};

function titleCaseWord(word: string): string {
  if (!word) return word;
  if (word.length <= 2 && word === word.toUpperCase()) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/** "john.smith" / "john_smith" / "john-smith" → "John Smith" */
export function nameFromEmailLocalPart(email: string | null | undefined): string | null {
  const raw = (email ?? "").trim().toLowerCase();
  const at = raw.indexOf("@");
  if (at <= 0) return null;
  const local = raw.slice(0, at);
  if (!local || GENERIC_LOCAL_PARTS.has(local)) return null;
  if (/^\d+$/.test(local)) return null;

  const parts = local
    .split(/[._+\-]+/)
    .map((p) => p.replace(/\d+/g, "").trim())
    .filter((p) => p.length >= 2 && /^[a-z]+$/i.test(p));

  if (parts.length < 2) return null;
  const use =
    parts.length >= 2 ? [parts[0], parts[parts.length - 1]] : parts;
  if (use.some((p) => GENERIC_LOCAL_PARTS.has(p.toLowerCase()))) return null;

  return use.map(titleCaseWord).join(" ");
}

export function parseHonorific(
  raw: string | null | undefined,
): RecipientHonorific | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  return HONORIFIC_ALIASES[key] ?? null;
}

/** Strip leading honorific from a name and return both parts. */
export function splitHonorificFromName(raw: string | null | undefined): {
  honorific: RecipientHonorific | null;
  name: string | null;
} {
  let n = (raw ?? "").trim();
  if (!n) return { honorific: null, name: null };

  n = n
    .replace(/^(yth\.?|dear|kepada|to)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();

  const m = n.match(
    /^(bapak|bpk\.?|bp\.?|pak|ibu|bu|mas|mbak|mba|mb|mr\.?|mrs\.?|ms\.?|mister|miss)\s+(.+)$/i,
  );
  if (m) {
    const honorific = parseHonorific(m[1]);
    const name = cleanRecipientName(m[2]);
    return { honorific, name };
  }

  return { honorific: null, name: cleanRecipientName(n) };
}

export function cleanRecipientName(name: string | null | undefined): string | null {
  let n = (name ?? "").trim();
  if (!n) return null;
  n = n
    .replace(/^(yth\.?|dear|kepada|to)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  // Strip honorific prefix if still present
  n = n
    .replace(
      /^(bapak|bpk\.?|bp\.?|pak|ibu|bu|mas|mbak|mba|mb|mr\.?|mrs\.?|ms\.?)\s+/i,
      "",
    )
    .trim();

  if (
    /^(tim|team|hiring\s*manager|hr|human\s*resources|rekrutmen|recruitment)\b/i.test(
      n,
    )
  ) {
    return null;
  }
  if (n.length < 2 || n.length > 80) return null;
  if (!/[a-zA-Z\u00C0-\u024F]/.test(n)) return null;
  return n;
}

export function resolveRecipientName(input: {
  recruiterName?: string | null;
  recruiterEmail?: string | null;
}): string | null {
  const fromName = splitHonorificFromName(input.recruiterName).name;
  return fromName ?? nameFromEmailLocalPart(input.recruiterEmail);
}

export function resolveRecipientHonorific(input: {
  honorific?: string | null;
  recruiterName?: string | null;
}): RecipientHonorific | null {
  return (
    parseHonorific(input.honorific) ??
    splitHonorificFromName(input.recruiterName).honorific
  );
}

function lastName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] ?? fullName;
}

export function formatHonorificLabel(h: RecipientHonorific | string | null | undefined): string {
  switch (h) {
    case "bapak":
      return "Bapak";
    case "ibu":
      return "Ibu";
    case "mas":
      return "Mas";
    case "mbak":
      return "Mbak";
    case "mr":
      return "Mr.";
    case "ms":
      return "Ms.";
    case "mrs":
      return "Mrs.";
    default:
      return "—";
  }
}

export function formatNamedGreeting(
  language: "id" | "en",
  recipientName: string,
  honorific?: RecipientHonorific | null,
): string {
  const name = recipientName.trim();
  const h = honorific ?? null;

  if (language === "en") {
    if (h === "mr") return `Dear Mr. ${lastName(name)},`;
    if (h === "mrs") return `Dear Mrs. ${lastName(name)},`;
    if (h === "ms") return `Dear Ms. ${lastName(name)},`;
    // Indonesian honorifics in EN emails: keep full name without Mas/Mbak
    if (h === "bapak") return `Dear Mr. ${lastName(name)},`;
    if (h === "ibu") return `Dear Ms. ${lastName(name)},`;
    return `Dear ${name},`;
  }

  // Indonesian
  if (h === "bapak") return `Yth. Bapak ${name},`;
  if (h === "ibu") return `Yth. Ibu ${name},`;
  if (h === "mas") return `Yth. Mas ${name},`;
  if (h === "mbak") return `Yth. Mbak ${name},`;
  if (h === "mr") return `Yth. Mr. ${lastName(name)},`;
  if (h === "mrs") return `Yth. Mrs. ${lastName(name)},`;
  if (h === "ms") return `Yth. Ms. ${lastName(name)},`;
  return `Yth. ${name},`;
}
