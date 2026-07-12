import { describe, expect, it } from "vitest";
import {
  bold,
  code,
  escapeHtml,
  formatWib,
  joinBlocks,
  monoBlock,
} from "../src/bot/format.js";

describe("escapeHtml", () => {
  it("escapes special characters", () => {
    expect(escapeHtml(`a <b> & "c"`)).toBe(`a &lt;b&gt; &amp; "c"`);
  });
});

describe("telegram format helpers", () => {
  it("wraps bold and code", () => {
    expect(bold("Hi")).toBe("<b>Hi</b>");
    expect(code("/draft")).toBe("<code>/draft</code>");
    expect(monoBlock("line1\nline2")).toBe("<pre>line1\nline2</pre>");
  });

  it("joins non-empty blocks with blank lines", () => {
    expect(joinBlocks("a", "", null, "  ", "b")).toBe("a\n\nb");
  });
});

describe("formatWib", () => {
  it("formats a known UTC instant as WIB", () => {
    // 2026-07-11 17:00 UTC = 2026-07-12 00:00 WIB
    const date = new Date("2026-07-11T17:00:00.000Z");
    expect(formatWib(date)).toBe("12/07/2026 00:00 WIB");
  });
});
