import { describe, expect, test } from "bun:test";
import { buildImageBasePrompt } from "../src/lib/build-image-base-prompt";

describe("buildImageBasePrompt", () => {
  test("builds visual direction entirely from style-guide data", () => {
    const prompt = buildImageBasePrompt({
      name: "Test style",
      guidance: "Use recurring orbital motifs.",
      visual: {
        artDirection: "Geometric paper collage",
        palette: ["cobalt", "ochre"],
        composition: "Open and asymmetrical",
        avoid: ["photorealism"],
      },
    });

    expect(prompt).toContain("Art direction: Geometric paper collage");
    expect(prompt).toContain("Palette: cobalt, ochre");
    expect(prompt).toContain("Composition: Open and asymmetrical");
    expect(prompt).toContain("Avoid: photorealism");
    expect(prompt).toContain("Use recurring orbital motifs.");
  });

  test("does not impose visual direction when the guide is empty", () => {
    expect(
      buildImageBasePrompt({ name: "Default style guide", guidance: "" }),
    ).toBe("Subject: ");
  });
});
