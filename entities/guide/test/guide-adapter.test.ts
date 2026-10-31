import { describe, expect, it } from "bun:test";
import { guideAdapter, guideMetadataSchema, type Guide } from "../src";
import { writerMarkdown } from "./fixtures";

describe("GuideAdapter", () => {
  it("carries every frontmatter field into metadata", () => {
    const parsed = guideAdapter.fromMarkdown(writerMarkdown);

    expect(parsed.entityType).toBe("guide");
    expect(parsed.metadata).toEqual({
      title: "Moving in as a writer",
      slug: "writer",
      order: 10,
      persona: "The writer",
      for: "You have years of essays and a folder of drafts.",
      recipe: "professional",
      brings: null,
      material: [
        {
          from: "Drafts and fragments",
          where: "Google Docs, Word, a notes app",
          becomes: "note",
          how: "Download as Markdown, bring the files in",
        },
      ],
    });
  });

  it("rejects markdown whose frontmatter is not a guide", () => {
    expect(() =>
      guideAdapter.fromMarkdown(writerMarkdown.replace("order: 10", "")),
    ).toThrow();
  });

  it("round-trips markdown through the entity", () => {
    const parsed = guideAdapter.fromMarkdown(writerMarkdown);
    const entity: Guide = {
      id: "writer",
      entityType: "guide",
      content: writerMarkdown,
      created: "2026-10-29T00:00:00.000Z",
      updated: "2026-10-29T00:00:00.000Z",
      visibility: "public",
      contentHash: "hash",
      metadata: guideMetadataSchema.parse(parsed.metadata),
    };

    const markdown = guideAdapter.toMarkdown(entity);

    expect(guideAdapter.fromMarkdown(markdown)).toEqual({
      ...parsed,
      content: markdown,
    });
    expect(markdown).toContain("## Bring your drafts in");
    expect(markdown).toContain(
      "Exact steps: [Content management](/docs/content-management).",
    );
  });
});
