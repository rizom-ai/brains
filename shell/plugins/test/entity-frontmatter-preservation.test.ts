import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { defineEntity } from "../src";
import { createEntityPackagePlugins } from "../src/entity/declarative-entity-plugin";

// Metadata is a queryable index over the entity, not necessarily the whole
// of its frontmatter: `@brains/link` indexes two of seven fields, and
// `@brains/assessment` indexes one while the whole SWOT payload sits in
// frontmatter. Writing must not drop what metadata does not claim.

const bookmarkMetadata = z.object({ title: z.string(), status: z.string() });

const bookmark = defineEntity({
  type: "bookmark",
  purpose: "A saved URL.",
  metadata: bookmarkMetadata,
});

// The same entity, but declaring a codec — which is what any converted
// package does. The codec only knows the two indexed fields.
const codecBookmark = defineEntity({
  type: "bookmark",
  purpose: "A saved URL.",
  metadata: bookmarkMetadata,
  markdown: {
    decode: ({ content, frontmatter }) => ({
      content,
      metadata: bookmarkMetadata.parse({
        title: frontmatter["title"],
        status: frontmatter["status"],
      }),
    }),
    encode: ({ content, metadata }) => ({
      content,
      frontmatter: { title: metadata.title, status: metadata.status },
    }),
  },
});

function adapterFor(
  definition = bookmark,
): ReturnType<typeof createEntityPackagePlugins>[number] {
  const plugin = createEntityPackagePlugins(
    [definition],
    [],
    { name: "@fixture/bookmarks", version: "0.1.0" },
    (id) => `@fixture/bookmarks:${id}`,
  )[0];
  if (!plugin) throw new Error("Bookmark entity plugin was not created");
  return plugin;
}

describe("declarative entity markdown", () => {
  it("carries forward frontmatter the metadata does not claim", () => {
    const plugin = adapterFor();
    const content = [
      "---",
      "title: Saved page",
      "status: draft",
      "url: https://example.com/a",
      "domain: example.com",
      "capturedAt: 2025-01-01T00:00:00.000Z",
      "---",
      "",
      "The summary body.",
    ].join("\n");

    const markdown = plugin.adapter.toMarkdown({
      id: "saved-page",
      entityType: "bookmark",
      content,
      visibility: "public",
      metadata: { title: "Saved page", status: "published" },
      contentHash: "hash",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z",
    });

    // Unclaimed fields survive, and the claimed one takes the new value.
    expect(markdown).toContain("example.com/a");
    expect(markdown).toContain("domain: example.com");
    expect(markdown).toContain("capturedAt: 2025-01-01T00:00:00.000Z");
    expect(markdown).toContain("status: published");
    expect(markdown).toContain("The summary body.");
    // The body is written once, not once per round trip.
    expect(markdown.match(/^---$/gmu)).toHaveLength(2);
  });

  it("carries it forward through a declared codec too", () => {
    const plugin = adapterFor(codecBookmark);
    const content = [
      "---",
      "title: Saved page",
      "status: draft",
      "url: https://example.com/a",
      "domain: example.com",
      "---",
      "",
      "The summary body.",
    ].join("\n");

    const markdown = plugin.adapter.toMarkdown({
      id: "saved-page",
      entityType: "bookmark",
      content,
      visibility: "public",
      metadata: { title: "Saved page", status: "published" },
      contentHash: "hash",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z",
    });

    expect(markdown).toContain("example.com/a");
    expect(markdown).toContain("domain: example.com");
    expect(markdown).toContain("status: published");
    expect(markdown.match(/^---$/gmu)).toHaveLength(2);
  });

  it("writes plain frontmatter when the content carries none", () => {
    const plugin = adapterFor();
    const markdown = plugin.adapter.toMarkdown({
      id: "saved-page",
      entityType: "bookmark",
      content: "Just a body.",
      visibility: "public",
      metadata: { title: "Saved page", status: "draft" },
      contentHash: "hash",
      created: "2025-01-01T00:00:00.000Z",
      updated: "2025-01-01T00:00:00.000Z",
    });

    expect(markdown).toContain("title: Saved page");
    expect(markdown).toContain("Just a body.");
    expect(markdown.match(/^---$/gmu)).toHaveLength(2);
  });
});
