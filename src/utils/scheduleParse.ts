/** Parse jadwal pengiriman (waktu dianggap WIB / Asia/Jakarta). */

export type ScheduleParseResult =
  | { ok: true; at: Date }
  | { ok: false; reason: string };

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Current calendar date/time parts in Asia/Jakarta. */
export function wibParts(date = new Date()): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
  };
}

export function dateFromWib(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const iso = `${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00+07:00`;
  return new Date(iso);
}

function parseTimeHm(raw: string): { hour: number; minute: number } | null {
  const m = raw.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseDateDmyOrYmd(
  raw: string,
): { year: number; month: number; day: number } | null {
  const dmy = raw.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }
  const ymd = raw.trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return { year, month, day };
  }
  return null;
}

/**
 * Supported:
 * - "18:00" (today WIB if still future, else tomorrow)
 * - "12/07/2026 18:00" or "2026-07-12 18:00"
 * - "+30m" / "+2h"
 */
export function parseScheduleInput(
  input: string,
  now = new Date(),
): ScheduleParseResult {
  const raw = input.trim();
  if (!raw) {
    return { ok: false, reason: "Waktu jadwal kosong." };
  }

  const relative = raw.match(/^\+(\d+)\s*(m|menit|h|jam)$/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, reason: "Durasi tidak valid." };
    }
    const ms =
      unit.startsWith("h") || unit === "jam"
        ? amount * 60 * 60 * 1000
        : amount * 60 * 1000;
    return { ok: true, at: new Date(now.getTime() + ms) };
  }

  const timeOnly = parseTimeHm(raw);
  if (timeOnly) {
    const w = wibParts(now);
    let at = dateFromWib(w.year, w.month, w.day, timeOnly.hour, timeOnly.minute);
    if (at.getTime() <= now.getTime() + 30_000) {
      // already past (or too soon) → tomorrow
      const tomorrow = new Date(at.getTime() + 24 * 60 * 60 * 1000);
      const t = wibParts(tomorrow);
      at = dateFromWib(
        t.year,
        t.month,
        t.day,
        timeOnly.hour,
        timeOnly.minute,
      );
    }
    return { ok: true, at };
  }

  const parts = raw.split(/\s+/);
  if (parts.length >= 2) {
    const datePart = parseDateDmyOrYmd(parts[0]);
    const timePart = parseTimeHm(parts[1]);
    if (datePart && timePart) {
      const at = dateFromWib(
        datePart.year,
        datePart.month,
        datePart.day,
        timePart.hour,
        timePart.minute,
      );
      if (Number.isNaN(at.getTime())) {
        return { ok: false, reason: "Tanggal/waktu tidak valid." };
      }
      if (at.getTime() <= now.getTime() + 30_000) {
        return {
          ok: false,
          reason: "Waktu jadwal harus di masa depan (WIB).",
        };
      }
      return { ok: true, at };
    }
  }

  return {
    ok: false,
    reason:
      "Format tidak dikenali. Contoh: 18:00 · 12/07/2026 18:00 · +30m · +2h",
  };
}
