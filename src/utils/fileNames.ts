/** Pure helpers untuk nama file CV / lampiran. */

export function looksLikeCvFileName(fileName: string): boolean {
  const name = fileName.toLowerCase();
  return (
    /(^|[^a-z])cv([^a-z]|$)/i.test(name) ||
    name.includes("resume") ||
    name.includes("curriculum") ||
    name.includes("riwayat_hidup") ||
    name.includes("riwayat-hidup") ||
    name.includes("daftar_riwayat")
  );
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\/\\?%*:|"<>]/g, "_").trim();
}

export function resolveAttachmentFilename(
  originalName: string | null | undefined,
  fullName: string | null | undefined,
): string {
  const original = originalName?.trim();
  if (original && looksLikeCvFileName(original)) {
    return original.toLowerCase().endsWith(".pdf")
      ? original
      : `${original}.pdf`;
  }

  const name = sanitizeFileName(fullName?.trim() || "Pelamar");
  return `CV_${name}.pdf`;
}
