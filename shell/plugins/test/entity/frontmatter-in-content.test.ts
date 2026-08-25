import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { frontmatterInContent } from "../../src/public/entity-definition";

const metadataSchema = z.object({
  status: z.string(),
  slug: z.string(),
});

const codec = frontmatterInContent((frontmatter) =>
  metadataSchema.parse({
    status: frontmatter["status"],
    slug: String(frontmatter["url"] ?? "").replace(/\W+/g, "-"),
  }),
);

const stored = `---
name: Yeehaa
kind: team
status: discovered
url: yeehaa.io
---

About this agent.`;

describe("a type that keeps its frontmatter in the file", () => {
  it("derives metadata from the frontmatter and leaves the file whole", () => {
    const { content, metadata } = codec.decode({
      content: stored,
      frontmatter: {
        name: "Yeehaa",
        kind: "team",
        status: "discovered",
        url: "yeehaa.io",
      },
    });
    expect(metadata).toEqual({ status: "discovered", slug: "yeehaa-io" });
    expect(content).toContain("About this agent.");
    expect(content).toContain("status: discovered");
  });

  it("writes metadata back into the file, so a status change reaches disk", () => {
    const { content, frontmatter } = codec.encode({
      content: stored,
      metadata: { status: "approved", slug: "yeehaa-io" },
    });
    expect(content).toContain("status: approved");
    expect(content).not.toContain("status: discovered");
    // Not declared separately: it is already inside the content, and
    // declaring it here would write it twice.
    expect(frontmatter).toEqual({});
  });

  it("keeps fields the file carries that metadata does not", () => {
    const { content } = codec.encode({
      content: stored,
      metadata: { status: "approved", slug: "yeehaa-io" },
    });
    expect(content).toContain("kind: team");
    expect(content).toContain("name: Yeehaa");
    expect(content).toContain("About this agent.");
  });
});
