import { describe, expect, it } from "vitest";
import {
  formatMissingFieldsPrompt,
  getMissingJobFields,
  parseJobFieldReply,
} from "../src/services/jobComplete.js";

describe("getMissingJobFields", () => {
  it("returns empty when all filled", () => {
    expect(
      getMissingJobFields({
        position: "QA",
        company: "Acme",
        recruiterEmail: "hr@acme.com",
      }),
    ).toEqual([]);
  });

  it("detects blank and whitespace-only fields", () => {
    expect(
      getMissingJobFields({
        position: "  ",
        company: null,
        recruiterEmail: "a@b.com",
      }),
    ).toEqual(["position", "company"]);
  });
});

describe("parseJobFieldReply", () => {
  it("parses labeled lines for missing fields only", () => {
    const parsed = parseJobFieldReply(
      "posisi: QA Engineer\nperusahaan: Acme\nemail: hr@acme.com",
      ["position", "company", "recruiterEmail"],
    );
    expect(parsed).toEqual({
      position: "QA Engineer",
      company: "Acme",
      recruiterEmail: "hr@acme.com",
    });
  });

  it("ignores fields that are not missing", () => {
    const parsed = parseJobFieldReply("posisi: QA\nemail: a@b.com", [
      "recruiterEmail",
    ]);
    expect(parsed).toEqual({ recruiterEmail: "a@b.com" });
  });

  it("accepts bare email when only email is missing", () => {
    expect(parseJobFieldReply("hr@acme.com", ["recruiterEmail"])).toEqual({
      recruiterEmail: "hr@acme.com",
    });
  });

  it("supports = separator and english keys", () => {
    expect(
      parseJobFieldReply("position = Backend\ncompany=Foo", [
        "position",
        "company",
      ]),
    ).toEqual({ position: "Backend", company: "Foo" });
  });
});

describe("formatMissingFieldsPrompt", () => {
  it("mentions job id and field labels", () => {
    const text = formatMissingFieldsPrompt(7, ["position", "recruiterEmail"]);
    expect(text).toContain("#7");
    expect(text).toContain("posisi");
    expect(text).toContain("email");
    expect(text).toContain("BATAL");
  });
});
