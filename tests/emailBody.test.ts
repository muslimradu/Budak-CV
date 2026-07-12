import { describe, expect, it } from "vitest";
import {
  finalizeEmailBody,
  normalizePlainBody,
  plainBodyToHtml,
} from "../src/utils/emailBody.js";

describe("finalizeEmailBody", () => {
  it("collapses hard line breaks inside a paragraph", () => {
    const input = "Sebagai QA\nEngineer saya tertarik.\n\nHormat saya,";
    const out = finalizeEmailBody(input);
    expect(out).toContain("QA Engineer");
    expect(out).not.toMatch(/QA\nEngineer/);
    expect(out.includes("\u00A0")).toBe(false);
    expect(out.split("\n\n")).toHaveLength(2);
  });

  it("joins soft-wrapped fragments into one flowing paragraph", () => {
    const input = [
      "Saya tertarik sebagai QA",
      "Engineer karena kesempatan untuk mengembangkan kemampuan saya dalam",
      "pengujian perangkat lunak.",
    ].join("\n");

    const out = finalizeEmailBody(input);
    expect(out.includes("\n")).toBe(false);
    expect(out).toContain("QA Engineer");
    expect(out).toContain("kemampuan saya dalam pengujian");
  });

  it("keeps blank lines only between paragraphs", () => {
    const out = finalizeEmailBody(
      "Paragraf satu.\n\n\nParagraf dua.\nlanjutan.",
    );
    expect(out).toBe("Paragraf satu.\n\nParagraf dua. lanjutan.");
  });
});

describe("plainBodyToHtml", () => {
  it("wraps paragraphs in <p> and escapes HTML", () => {
    const html = plainBodyToHtml("Halo <test>.\n\nParagraf dua.");
    expect(html).toContain("<p");
    expect(html).toContain("Halo &lt;test&gt;.");
    expect(html).toContain("Paragraf dua.");
  });

  it("strips NBSP so titles wrap naturally", () => {
    const html = plainBodyToHtml(
      "Quality\u00A0Assurance Engineer di perusahaan.",
    );
    expect(html).toContain("Quality Assurance Engineer");
    expect(html).not.toContain("\u00A0");
  });
});

describe("normalizePlainBody", () => {
  it("removes mid-paragraph newlines and NBSP", () => {
    expect(
      normalizePlainBody("Quality\u00A0Assurance\nEngineer.\n\nHormat saya,"),
    ).toBe("Quality Assurance Engineer.\n\nHormat saya,");
  });
});
