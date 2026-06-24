import { describe, it, expect } from "bun:test";
import {
  whitepaperGenerationSchema,
  whitepaperGenerationTemplate,
} from "../src/templates/generation-template";

describe("whitepaperGenerationTemplate", () => {
  it("validates generated outline data", () => {
    const result = whitepaperGenerationSchema.safeParse({
      title: "Regenerative Coordination Infrastructure",
      subtitle: "A civic technology outline",
      thesis:
        "Institutions need coordination infrastructure that preserves sovereignty and accountability.",
      abstract:
        "This paper outlines a civic infrastructure approach to distributed coordination.",
      keywords: ["coordination", "institutions"],
      body: "## Executive Summary\n\n- Core argument\n\n## Roadmap\n\n- First phase",
    });

    expect(result.success).toBe(true);
  });

  it("is registered under the whitepaper generation template name", () => {
    expect(whitepaperGenerationTemplate.name).toBe("whitepaper:generation");
    expect(whitepaperGenerationTemplate.dataSourceId).toBe("shell:ai-content");
    expect(whitepaperGenerationTemplate.useKnowledgeContext).toBe(true);
    expect(whitepaperGenerationTemplate.basePrompt).toContain("outline");
  });
});
