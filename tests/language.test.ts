import { describe, expect, it } from "vitest";
import {
  detectLanguageFromText,
  resolveEmailLanguage,
  resolvePostingLanguage,
} from "../src/utils/language.js";

describe("detectLanguageFromText", () => {
  it("detects English job posts", () => {
    const text = `
We are looking for a Backend Engineer with 3+ years of experience.
Requirements: Node.js, PostgreSQL, and strong communication skills.
Job description: You will build APIs and work with the product team.
`;
    expect(detectLanguageFromText(text)).toBe("en");
  });

  it("detects Indonesian job posts", () => {
    const text = `
Kami mencari Backend Engineer dengan pengalaman minimal 3 tahun.
Persyaratan: Node.js, PostgreSQL, dan kemampuan komunikasi yang baik.
Lowongan ini untuk bergabung dengan perusahaan kami sebagai developer.
`;
    expect(detectLanguageFromText(text)).toBe("id");
  });
});

describe("resolvePostingLanguage", () => {
  it("overrides wrong LLM id when text is clearly English", () => {
    const text =
      "Looking for a QA Engineer. Requirements: Selenium, years of experience, job description below.";
    expect(resolvePostingLanguage(text, "id")).toBe("en");
  });
});

describe("resolveEmailLanguage", () => {
  it("uses preference when forced", () => {
    expect(resolveEmailLanguage("en", "id")).toBe("en");
    expect(resolveEmailLanguage("id", "en")).toBe("id");
  });

  it("follows job language in auto mode", () => {
    expect(resolveEmailLanguage("auto", "en")).toBe("en");
    expect(resolveEmailLanguage("auto", "id")).toBe("id");
  });
});
