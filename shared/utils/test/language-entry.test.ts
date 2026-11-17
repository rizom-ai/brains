import { describe, expect, it } from "bun:test";
import { languageEntry } from "../src/language-entry";

describe("languageEntry", () => {
  it("finds a language whatever the case of its tag", () => {
    expect(languageEntry({ "pt-BR": "olá" }, "pt-br")).toBe("olá");
    expect(languageEntry({ nl: "hallo" }, "NL")).toBe("hallo");
  });

  it("finds nothing for a language that has no entry, or no record", () => {
    expect(languageEntry({ nl: "hallo" }, "de")).toBeUndefined();
    expect(languageEntry(undefined, "nl")).toBeUndefined();
  });
});
