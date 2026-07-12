/** Helpers untuk balasan Telegram yang rapi (HTML). */

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function bold(text: string): string {
  return `<b>${escapeHtml(text)}</b>`;
}

export function code(text: string): string {
  return `<code>${escapeHtml(text)}</code>`;
}

export function monoBlock(text: string): string {
  return `<pre>${escapeHtml(text)}</pre>`;
}

export function section(title: string, lines: string[]): string {
  return [bold(title), ...lines.filter(Boolean)].join("\n");
}

export function kv(label: string, value: string): string {
  return `${escapeHtml(label)}: ${escapeHtml(value)}`;
}

export function divider(): string {
  return "────────";
}

export function joinBlocks(...blocks: Array<string | null | undefined>): string {
  return blocks.filter((b) => b && b.trim().length > 0).join("\n\n");
}

/** Format tanggal/waktu ke WIB (UTC+7), contoh: 12/07/2026 01:59 WIB */
export function formatWib(date: Date): string {
  const parts = new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")} WIB`;
}

export const replyHtml = { parse_mode: "HTML" as const };
