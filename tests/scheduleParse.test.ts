import { describe, expect, it } from "vitest";
import {
  dateFromWib,
  parseScheduleInput,
  wibParts,
} from "../src/utils/scheduleParse.js";

describe("parseScheduleInput", () => {
  it("parses +30m relative", () => {
    const now = new Date("2026-07-12T10:00:00.000Z");
    const result = parseScheduleInput("+30m", now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.at.getTime() - now.getTime()).toBe(30 * 60 * 1000);
    }
  });

  it("parses +2h relative", () => {
    const now = new Date("2026-07-12T10:00:00.000Z");
    const result = parseScheduleInput("+2h", now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.at.getTime() - now.getTime()).toBe(2 * 60 * 60 * 1000);
    }
  });

  it("parses absolute WIB datetime", () => {
    const now = dateFromWib(2026, 7, 12, 10, 0);
    const result = parseScheduleInput("12/07/2026 18:00", now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.at.toISOString()).toBe(
        dateFromWib(2026, 7, 12, 18, 0).toISOString(),
      );
    }
  });

  it("rejects past absolute WIB datetime", () => {
    const now = dateFromWib(2026, 7, 12, 19, 0);
    const result = parseScheduleInput("12/07/2026 18:00", now);
    expect(result.ok).toBe(false);
  });

  it("parses time-only into a future WIB slot", () => {
    const now = dateFromWib(2026, 7, 12, 10, 0);
    const result = parseScheduleInput("18:00", now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const parts = wibParts(result.at);
      expect(parts.hour).toBe(18);
      expect(parts.minute).toBe(0);
      expect(result.at.getTime()).toBeGreaterThan(now.getTime());
    }
  });

  it("rejects invalid format", () => {
    const result = parseScheduleInput("besok sore");
    expect(result.ok).toBe(false);
  });
});
