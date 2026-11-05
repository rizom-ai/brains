import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { entityViewFields } from "../../src/entity/entity-view";

const metadata = z.object({ slug: z.string() });
const frontmatter = z.object({ title: z.string() });
const view = z.object(entityViewFields("post", metadata, frontmatter));

const stored: z.output<typeof view> = {
  id: "post-1",
  entityType: "post",
  content: "---\ntitle: Post\n---\nBody",
  created: "2026-01-01",
  updated: "2026-01-02",
  visibility: "shared",
  metadata: { slug: "post-1" },
  contentHash: "hash-1",
  frontmatter: { title: "Post" },
};

describe("entityViewFields", () => {
  it("parses a stored entity with its own metadata and frontmatter", () => {
    const parsed = view.parse(stored);

    expect(parsed).toEqual(stored);
    expect(Object.keys(parsed)).toEqual([
      "id",
      "entityType",
      "content",
      "created",
      "updated",
      "visibility",
      "metadata",
      "contentHash",
      "frontmatter",
    ]);
  });

  it("accepts only the given entity type", () => {
    expect(view.safeParse({ ...stored, entityType: "deck" }).success).toBe(
      false,
    );
  });

  it("validates metadata and frontmatter with the given schemas", () => {
    expect(view.safeParse({ ...stored, metadata: {} }).success).toBe(false);
    expect(view.safeParse({ ...stored, frontmatter: {} }).success).toBe(false);
  });
});
