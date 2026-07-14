import { describe, expect, it } from "vitest";
import { parseRevisiUpdates } from "../src/services/revisi.js";

describe("parseRevisiUpdates", () => {
  it("parses a single field", () => {
    expect(parseRevisiUpdates("sapaan: Mbak")).toEqual({ sapaan: "Mbak" });
  });

  it("parses multiple comma-separated fields", () => {
    expect(
      parseRevisiUpdates(
        "nama: Dodit Mulyanto, sapaan: Mas, perusahaan: PT Angin Ribut",
      ),
    ).toEqual({
      nama: "Dodit Mulyanto",
      sapaan: "Mas",
      company: "PT Angin Ribut",
    });
  });

  it("parses body instruction with commas", () => {
    expect(
      parseRevisiUpdates(
        "body: hilangkan bagian pengalaman di katalon, ganti dengan pengalaman di playwright di tim sebelumnya",
      ),
    ).toEqual({
      body: "hilangkan bagian pengalaman di katalon, ganti dengan pengalaman di playwright di tim sebelumnya",
    });
  });
});
