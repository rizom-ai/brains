import { describe, expect, test } from "bun:test";
import {
  formatStyleGuidance,
  formatVisualGuidance,
  formatVoiceGuidance,
  styleGuideAdapter,
} from "../src";

describe("style guide", () => {
  test("round-trips structured guidance and markdown body", () => {
    const content = styleGuideAdapter.createStyleGuideContent(
      {
        name: "Default",
        messaging: { audiences: ["builders"] },
        voice: { summary: "Clear and direct", avoid: ["jargon"] },
        visual: { palette: ["#3921D7"], avoid: ["photorealism"] },
      },
      "Use concrete examples.",
    );

    const parsed = styleGuideAdapter.parseStyleGuide(content);
    expect(parsed.voice?.summary).toBe("Clear and direct");
    expect(parsed.guidance).toBe("Use concrete examples.");
    expect(formatVoiceGuidance(parsed)).toContain("Clear and direct");
    expect(formatVisualGuidance(parsed)).toContain("#3921D7");
  });

  test("includes shared body guidance once when composing both facets", () => {
    const styleGuide = styleGuideAdapter.parseStyleGuide(
      styleGuideAdapter.createStyleGuideContent(
        {
          name: "Combined",
          voice: { summary: "Direct and grounded" },
          visual: { artDirection: "Editorial diagrams" },
        },
        "Shared rationale and exceptions.",
      ),
    );

    const guidance = formatStyleGuidance(styleGuide, "both");
    const combined = [guidance.voice, guidance.visual]
      .filter((value) => value !== undefined)
      .join("\n");

    expect(combined).toContain("Direct and grounded");
    expect(combined).toContain("Editorial diagrams");
    expect(combined.match(/Shared rationale and exceptions\./g)).toHaveLength(
      1,
    );
  });

  test("preserves imported extension fields during markdown serialization", () => {
    const content = `---
name: Imported
voice:
  summary: Precise
customExamples:
  - Keep this extension
---

Long-form guidance.`;
    const output = styleGuideAdapter.toMarkdown({
      id: "style-guide",
      entityType: "style-guide",
      content,
      metadata: {},
      visibility: "public",
      contentHash: "hash",
      created: "2026-01-01T00:00:00.000Z",
      updated: "2026-01-01T00:00:00.000Z",
    });

    expect(output).toContain("customExamples:");
    expect(output).toContain("Keep this extension");
    expect(output).toContain("Long-form guidance.");
  });
});
