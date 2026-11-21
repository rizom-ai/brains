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

// The next stored form (docs/plans/one-stored-form.md) states the
// structured guidance as body sections above the free-form guidance.
describe("a style guide in the next stored form", () => {
  test("reads the same guide as the current form, guidance sections included", () => {
    const guidance = "## Exceptions\n\nQuote people as they spoke.\n";
    const current = createStyleGuideContent(
      {
        name: "Default",
        messaging: { positioning: "For builders", audiences: ["builders"] },
        voice: { summary: "Clear and direct", avoid: ["jargon"] },
      },
      guidance,
    );
    const next = `---\nname: Default\n---\n## Messaging\n\n- **Positioning:** For builders\n\n### Audiences\n\n- builders\n\n## Voice\n\n- **Summary:** Clear and direct\n\n### Avoid\n\n- jargon\n\n${guidance}`;
    expect(parseStyleGuideContent(next)).toEqual(
      parseStyleGuideContent(current),
    );
  });
});
