import { describe, expect, it } from "bun:test";
import { linkedinTemplate } from "../../src/templates/linkedin-template";

describe("linkedinTemplate", () => {
  it("keeps prompt-only posts grounded in the prompt instead of adjacent context", () => {
    expect(linkedinTemplate.basePrompt).toContain(
      "For general prompt-only posts, use the prompt as the source of truth",
    );
    expect(linkedinTemplate.basePrompt).toContain(
      "Do not introduce URLs, blog/project/deck themes, source references, or specialized framing from adjacent knowledge context",
    );
  });
});
