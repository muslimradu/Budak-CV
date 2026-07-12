import { describe, expect, it } from "vitest";
import {
  looksLikeCvFileName,
  resolveAttachmentFilename,
} from "../src/utils/fileNames.js";

describe("looksLikeCvFileName", () => {
  it("detects CV-like names", () => {
    expect(looksLikeCvFileName("CV_Radu.pdf")).toBe(true);
    expect(looksLikeCvFileName("resume-final.pdf")).toBe(true);
    expect(looksLikeCvFileName("my_curriculum_vitae.pdf")).toBe(true);
  });

  it("rejects unrelated names", () => {
    expect(looksLikeCvFileName("document.pdf")).toBe(false);
    expect(looksLikeCvFileName("job-posting.pdf")).toBe(false);
  });
});

describe("resolveAttachmentFilename", () => {
  it("keeps original name when it looks like a CV", () => {
    expect(resolveAttachmentFilename("CV_Radu.pdf", "Someone")).toBe(
      "CV_Radu.pdf",
    );
  });

  it("appends .pdf when CV-like name has no extension", () => {
    expect(resolveAttachmentFilename("CV_Radu", "Someone")).toBe("CV_Radu.pdf");
  });

  it("falls back to CV_FullName.pdf", () => {
    expect(resolveAttachmentFilename("document.pdf", "Radu Muhammad")).toBe(
      "CV_Radu Muhammad.pdf",
    );
    expect(resolveAttachmentFilename(null, null)).toBe("CV_Pelamar.pdf");
  });

  it("sanitizes unsafe characters in full name", () => {
    expect(resolveAttachmentFilename(null, 'Radu/Test:Name')).toBe(
      "CV_Radu_Test_Name.pdf",
    );
  });
});
