import { describe, expect, it } from "bun:test";
import { mergeProfileImport } from "../src/lib/merge-profile";

describe("mergeProfileImport", () => {
  it("fills absent fields while preserving owner-authored profile data", () => {
    const current = `---
name: Unknown
kind: professional
role: Advisor
headline: My carefully edited headline
expertise:
  - resilient systems
---
My carefully edited story.
`;

    const result = mergeProfileImport(current, {
      name: "Ada Morgan",
      headline: "Imported LinkedIn headline",
      industry: "Climate Technology",
      location: "Rotterdam, Netherlands",
      website: "https://ada.example.com",
      story: "Imported LinkedIn summary.",
    });

    expect(result.changed).toBe(true);
    expect(result.appliedFields).toEqual([
      "name",
      "industry",
      "location",
      "website",
    ]);
    expect(result.preservedFields).toEqual(["headline", "story"]);
    expect(result.content).toContain("name: Ada Morgan");
    expect(result.content).toContain("role: Advisor");
    expect(result.content).toContain("headline: My carefully edited headline");
    expect(result.content).toContain("- resilient systems");
    expect(result.content).toContain("My carefully edited story.");
  });

  it("replaces known seed placeholders without treating them as owner edits", () => {
    const result = mergeProfileImport(
      `---
name: Your Name Here
kind: professional
website: https://example.com
---
This is where your story goes. How you got here, what drives you, why anyone should care.

(Delete this and write your own. Rover won't judge.)
`,
      {
        name: "Ada Morgan",
        website: "https://ada.example.com",
        story: "Imported LinkedIn summary.",
      },
    );

    expect(result.appliedFields).toEqual(["name", "website", "story"]);
    expect(result.content).toContain("name: Ada Morgan");
    expect(result.content).toContain("https://ada.example.com");
    expect(result.content).toContain("Imported LinkedIn summary.");
    expect(result.content).not.toContain("This is where your story goes");
  });

  it("adds a LinkedIn summary when the profile body is empty", () => {
    const result = mergeProfileImport(
      `---
name: Ada Morgan
kind: professional
---
`,
      { story: "Imported LinkedIn summary." },
    );

    expect(result.appliedFields).toEqual(["story"]);
    expect(result.content).toContain("Imported LinkedIn summary.");
  });

  it("is idempotent when imported values are already present", () => {
    const current = `---
name: Ada Morgan
kind: professional
industry: Climate Technology
---
Imported LinkedIn summary.
`;
    const result = mergeProfileImport(current, {
      name: "Ada Morgan",
      industry: "Climate Technology",
      story: "Imported LinkedIn summary.",
    });

    expect(result).toEqual({
      content: current,
      appliedFields: [],
      preservedFields: [],
      changed: false,
    });
  });
});
