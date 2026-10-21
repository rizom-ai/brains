import { describe, expect, it } from "bun:test";
import { projectGenerationTemplate } from "../src/templates/generation-template";

describe("projectGenerationTemplate", () => {
  it("leaves voice and tone to the style guide", () => {
    const prompt = projectGenerationTemplate.basePrompt ?? "";

    expect(prompt).toContain(
      "Follow the supplied style guide for voice, tone, wording and form",
    );
    expect(prompt).not.toContain("Tone:");
    expect(prompt).not.toContain("compelling");
  });
});
