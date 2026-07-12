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

  it("returns empty for unknown format", () => {
    expect(parseRevisiUpdates("ubah semuanya")).toEqual({});
  });
});
