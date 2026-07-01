import { describe, it, expect } from "bun:test";
import {
  whitepaperDraftExpansionSchema,
  whitepaperGenerationSchema,
  whitepaperGenerationTemplate,
} from "../src/templates/generation-template";
import { whitepaperDraftExpansionTemplate } from "../src/templates/draft-expansion-template";

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

  it("validates draft expansion data", () => {
    const result = whitepaperDraftExpansionSchema.safeParse({
      title: "Regenerative Coordination Infrastructure",
      subtitle: "A civic technology draft",
      thesis:
        "Institutions need coordination infrastructure that preserves sovereignty and accountability.",
      abstract:
        "This draft expands a civic infrastructure outline into prose for review.",
      keywords: ["coordination", "institutions"],
      body: "## Executive Summary\n\nThis section expands the outline into reviewable prose.",
    });

    expect(result.success).toBe(true);
  });

  it("is registered under the whitepaper generation template name", () => {
    expect(whitepaperGenerationTemplate.name).toBe("whitepaper:generation");
    expect(whitepaperGenerationTemplate.dataSourceId).toBe("shell:ai-content");
    expect(whitepaperGenerationTemplate.useKnowledgeContext).toBe(true);
    expect(whitepaperGenerationTemplate.basePrompt).toContain("outline");
  });

  it("is registered under the whitepaper draft expansion template name", () => {
    expect(whitepaperDraftExpansionTemplate.name).toBe(
      "whitepaper:draft-expansion",
    );
    expect(whitepaperDraftExpansionTemplate.dataSourceId).toBe(
      "shell:ai-content",
    );
    expect(whitepaperDraftExpansionTemplate.useKnowledgeContext).toBe(true);
    expect(whitepaperDraftExpansionTemplate.basePrompt).toContain("draft");
  });
});
