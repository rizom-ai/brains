import { describe, expect, it } from "bun:test";
import { seriesDescriptionTemplate } from "../src/templates/description-template";

describe("seriesDescriptionTemplate", () => {
  it("asks for a description without marketing wording of its own", () => {
    const prompt = seriesDescriptionTemplate.basePrompt ?? "";

    expect(prompt).not.toMatch(/compelling|engaging/i);
    expect(prompt).toContain("2-3 sentences");
  });
});
