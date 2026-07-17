import { describe, expect, it } from "bun:test";
import { parseMarkdownWithFrontmatter } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import { mergeProfileImport } from "../src/lib/merge-profile";

const frontmatterSchema = z.record(z.string(), z.unknown());

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

  it("appends new rich records by stable identity and preserves owner versions", () => {
    const current = `---
name: Ada Morgan
kind: professional
skills:
  - TypeScript
positions:
  - companyName: Example Labs
    title: Engineer
    startedOn: 2020-01
    description: Owner-authored description
education:
  - schoolName: Example University
    degreeName: MSc
    fieldOfStudy: Systems
    startedOn: "2018"
certifications:
  - name: Architecture Certificate
    issuingOrganization: Example Guild
    credentialId: cert-1
    credentialUrl: https://owner.example/cert-1
---
`;

    const result = mergeProfileImport(current, {
      skills: [" typescript ", "Distributed Systems", "distributed systems"],
      positions: [
        {
          companyName: " example labs ",
          title: "ENGINEER",
          startedOn: "2020-01",
          description: "Imported description",
        },
        {
          companyName: "New Company",
          title: "Architect",
          startedOn: "2024-01",
        },
      ],
      education: [
        {
          schoolName: "EXAMPLE UNIVERSITY",
          degreeName: "MSc",
          fieldOfStudy: "Systems",
          startedOn: "2018",
          notes: "Imported notes",
        },
      ],
      certifications: [
        {
          name: "Renamed by source",
          issuingOrganization: "example guild",
          credentialId: "CERT-1",
          credentialUrl: "https://imported.example/cert-1",
        },
      ],
    });

    expect(result.appliedFields).toEqual(["skills", "positions"]);
    expect(result.preservedFields).toEqual([
      "positions",
      "education",
      "certifications",
    ]);
    const parsed = parseMarkdownWithFrontmatter(
      result.content,
      frontmatterSchema,
    );
    expect(parsed.metadata["skills"]).toEqual([
      "TypeScript",
      "Distributed Systems",
    ]);
    expect(parsed.metadata["positions"]).toEqual([
      {
        companyName: "Example Labs",
        title: "Engineer",
        startedOn: "2020-01",
        description: "Owner-authored description",
      },
      {
        companyName: "New Company",
        title: "Architect",
        startedOn: "2024-01",
      },
    ]);
    expect(result.content).toContain("https://owner.example/cert-1");
    expect(result.content).not.toContain("https://imported.example/cert-1");
  });

  it("does not replace malformed owner-authored collection fields", () => {
    const current = `---
name: Ada Morgan
kind: professional
skills: deliberately-not-an-array
---
`;
    const result = mergeProfileImport(current, { skills: ["TypeScript"] });

    expect(result).toEqual({
      content: current,
      appliedFields: [],
      preservedFields: ["skills"],
      changed: false,
    });
  });

  it("is idempotent when imported values are already present", () => {
    const current = `---
name: Ada Morgan
kind: professional
industry: Climate Technology
skills:
  - Distributed Systems
---
Imported LinkedIn summary.
`;
    const result = mergeProfileImport(current, {
      name: "Ada Morgan",
      industry: "Climate Technology",
      skills: ["distributed systems"],
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
