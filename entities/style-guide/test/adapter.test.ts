import { describe, expect, test } from "bun:test";
import {
  createStyleGuideContent,
  formatStyleGuidance,
  formatVisualGuidance,
  formatVoiceGuidance,
  parseStyleGuideContent,
} from "../src";

describe("style guide", () => {
  test("round-trips structured guidance and markdown body", () => {
    const content = createStyleGuideContent(
      {
        name: "Default",
        messaging: { audiences: ["builders"] },
        voice: { summary: "Clear and direct", avoid: ["jargon"] },
        visual: { palette: ["#3921D7"], avoid: ["photorealism"] },
      },
      "Use concrete examples.",
    );

    const parsed = parseStyleGuideContent(content);
    expect(parsed.voice?.summary).toBe("Clear and direct");
    expect(parsed.guidance).toBe("Use concrete examples.");
    expect(formatVoiceGuidance(parsed)).toContain("Clear and direct");
    expect(formatVisualGuidance(parsed)).toContain("#3921D7");
  });

  test("includes shared body guidance once when composing both facets", () => {
    const styleGuide = parseStyleGuideContent(
      createStyleGuideContent(
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

  // Imported extension fields are kept by the runtime's serialization of
  // the declared type: packages/brain-cli/test/style-guide-runtime.test.ts.
});
