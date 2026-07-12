import { describe, expect, it } from "vitest";
import {
  cleanRecipientName,
  formatNamedGreeting,
  nameFromEmailLocalPart,
  parseHonorific,
  resolveRecipientHonorific,
  resolveRecipientName,
  splitHonorificFromName,
} from "../src/utils/recipientName.js";

describe("nameFromEmailLocalPart", () => {
  it("infers personal names from email locals", () => {
    expect(nameFromEmailLocalPart("budi.santoso@acme.com")).toBe("Budi Santoso");
    expect(nameFromEmailLocalPart("sarah_chen@corp.io")).toBe("Sarah Chen");
  });

  it("ignores generic mailboxes", () => {
    expect(nameFromEmailLocalPart("hr@acme.com")).toBeNull();
    expect(nameFromEmailLocalPart("careers@acme.com")).toBeNull();
  });
});

describe("honorifics", () => {
  it("parses honorific aliases", () => {
    expect(parseHonorific("Bapak")).toBe("bapak");
    expect(parseHonorific("mbak")).toBe("mbak");
    expect(parseHonorific("Mr.")).toBe("mr");
    expect(parseHonorific("Ms")).toBe("ms");
  });

  it("splits honorific from name strings", () => {
    expect(splitHonorificFromName("Bapak Andi Wijaya")).toEqual({
      honorific: "bapak",
      name: "Andi Wijaya",
    });
    expect(splitHonorificFromName("Ms. Sarah Chen")).toEqual({
      honorific: "ms",
      name: "Sarah Chen",
    });
  });

  it("formats greetings with honorific", () => {
    expect(formatNamedGreeting("id", "Budi Santoso", "bapak")).toBe(
      "Yth. Bapak Budi Santoso,",
    );
    expect(formatNamedGreeting("id", "Siti Aminah", "ibu")).toBe(
      "Yth. Ibu Siti Aminah,",
    );
    expect(formatNamedGreeting("id", "Rina", "mbak")).toBe("Yth. Mbak Rina,");
    expect(formatNamedGreeting("en", "John Smith", "mr")).toBe(
      "Dear Mr. Smith,",
    );
    expect(formatNamedGreeting("en", "Sarah Chen", "ms")).toBe(
      "Dear Ms. Chen,",
    );
  });

  it("resolves honorific from stored field or name prefix", () => {
    expect(
      resolveRecipientHonorific({
        honorific: "mas",
        recruiterName: "Budi",
      }),
    ).toBe("mas");
    expect(
      resolveRecipientHonorific({
        honorific: null,
        recruiterName: "Ibu Siti",
      }),
    ).toBe("ibu");
  });
});

describe("cleanRecipientName", () => {
  it("keeps person names and strips honorific prefix", () => {
    expect(cleanRecipientName("Budi Santoso")).toBe("Budi Santoso");
    expect(cleanRecipientName("Bapak Budi")).toBe("Budi");
  });

  it("rejects team labels", () => {
    expect(cleanRecipientName("Tim Rekrutmen")).toBeNull();
  });
});

describe("resolveRecipientName", () => {
  it("prefers explicit name over email", () => {
    expect(
      resolveRecipientName({
        recruiterName: "Andi Wijaya",
        recruiterEmail: "hr@acme.com",
      }),
    ).toBe("Andi Wijaya");
  });
});
