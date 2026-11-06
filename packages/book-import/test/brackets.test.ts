import { describe, expect, it } from "bun:test";
import { closedBrackets } from "../src/adapters/brackets";

describe("closedBrackets", () => {
  it("reads an exclamation mark read beside a closing bracket as the bracket", () => {
    expect(closedBrackets("nur über [dem Preise!], den sie")).toBe(
      "nur über [dem Preise], den sie",
    );
  });

  it("closes an unclosed bracket at its first word's exclamation mark", () => {
    expect(
      closedBrackets("[Käufer und Verkäufer! sich zu teuer ihre Waren"),
    ).toBe("[Käufer und Verkäufer] sich zu teuer ihre Waren");
  });

  it("keeps an exclamation mark before the one read as the bracket", () => {
    expect(closedBrackets("Beschluß [Schluß!! Der Waldeigenthümer")).toBe(
      "Beschluß [Schluß!] Der Waldeigenthümer",
    );
  });

  it("closes each unclosed bracket of a paragraph on its own", () => {
    expect(closedBrackets("[für! eine Stunde, [bei allen Waren! ein")).toBe(
      "[für] eine Stunde, [bei allen Waren] ein",
    );
  });

  it("leaves closed brackets and exclamations outside brackets alone", () => {
    expect(closedBrackets("kein [besonderer] Gewinn! Und [!] so")).toBe(
      "kein [besonderer] Gewinn! Und [!] so",
    );
  });
});
