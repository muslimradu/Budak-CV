/**
 * Rapikan body email: satu paragraf = satu baris mengalir (spasi biasa),
 * hanya baris kosong antar paragraf.
 *
 * Jangan pakai NBSP untuk "melindungi" frasa — di inbox penerima justru
 * membuat wrap aneh. Tampilan rapi dijamin lewat HTML di gmail/send.ts.
 */
export function finalizeEmailBody(
  body: string,
  _protectPhrases: Array<string | null | undefined> = [],
): string {
  return normalizePlainBody(body);
}

export function normalizePlainBody(body: string): string {
  return body
    .replace(/\r\n/g, "\n")
    .replace(/[\u2028\u2029\u0085]/g, "\n")
    .replace(/\u00A0/g, " ")
    .split(/\n\s*\n/)
    .map((block) =>
      block
        .replace(/\n+/g, " ")
        .replace(/\s+/g, " ")
        .replace(/\s+([,.;:!?])/g, "$1")
        .trim(),
    )
    .filter(Boolean)
    .join("\n\n");
}

export function cleanParagraph(text: string): string {
  return normalizePlainBody(text);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text → HTML paragraphs (full-width di Gmail penerima). */
export function plainBodyToHtml(body: string): string {
  const paragraphs = normalizePlainBody(body).split("\n\n");

  const htmlParts = paragraphs.map(
    (p) =>
      `<p style="margin:0 0 1em 0;line-height:1.5;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#222;">${escapeHtml(p)}</p>`,
  );

  return [
    "<!DOCTYPE html>",
    '<html><head><meta charset="UTF-8"></head>',
    '<body style="margin:0;padding:16px;">',
    ...htmlParts,
    "</body></html>",
  ].join("");
}
