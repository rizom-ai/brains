import { describe, expect, it } from "bun:test";
import { ALT_TEXT_LIMIT, altTextFrom } from "../src/jobs/describe-image";

describe("alt text from a description", () => {
  it("keeps a description within the limit as it is", () => {
    expect(altTextFrom("  Fishing boats moored at dawn.  ")).toBe(
      "Fishing boats moored at dawn.",
    );
  });

  it("cuts a long one at its last clause, never after a dangling word", () => {
    const alt = altTextFrom(
      "A surreal Bitcoin landscape centers on a giant ₿ amid coins, airplanes, snowy mountains, crowded industrial towns, and smoking chimneys under a gray sky.",
    );

    expect(alt).toBe(
      "A surreal Bitcoin landscape centers on a giant ₿ amid coins, airplanes, snowy mountains, crowded industrial towns",
    );
  });

  it("without a clause to cut at, ends on a word that carries meaning", () => {
    // 118 characters, then "and" where the limit falls.
    const head = `Boats ${"moored ".repeat(16)}`;
    const alt = altTextFrom(`${head}and gulls circling at dawn`);

    expect(alt.length).toBeLessThanOrEqual(ALT_TEXT_LIMIT);
    expect(alt.endsWith("moored")).toBe(true);
  });
});
