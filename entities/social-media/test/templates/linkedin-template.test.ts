import { describe, expect, it } from "bun:test";
import {
  linkedinPostSchema,
  linkedinTemplate,
} from "../../src/templates/linkedin-template";

describe("linkedinTemplate", () => {
  it("leaves voice and form to the style guide and keeps platform constraints", () => {
    const prompt = linkedinTemplate.basePrompt ?? "";

    expect(prompt).toContain(
      "Follow the supplied style guide for voice, tone, wording and form",
    );
    for (const voiceRule of [
      "single sentences per line",
      "Problem → Insight → Takeaway",
      "question to drive comments",
      "drive engagement",
      "HOOK",
    ]) {
      expect(prompt).not.toContain(voiceRule);
    }
    expect(prompt).toContain("3-5 relevant hashtags");
    expect(prompt).toContain("150-300 words");
    expect(linkedinPostSchema.shape.content.description).not.toContain(
      "engagement",
    );
  });

  it("keeps prompt-only posts grounded in the prompt instead of adjacent context", () => {
    expect(linkedinTemplate.basePrompt).toContain(
      "For general prompt-only posts, use the prompt as the source of truth",
    );
    expect(linkedinTemplate.basePrompt).toContain(
      "Do not introduce URLs, blog/project/deck themes, source references, or specialized framing from adjacent knowledge context",
    );
  });
});
