import { describe, expect, it } from "bun:test";
import {
  blogRenderSchema,
  blogViewSchema,
} from "../src/templates/blog-view-schema";

const input = {
  id: "item-1",
  content: "---\n---\nBody",
  created: "2026-01-01",
  updated: "2026-01-02",
  visibility: "shared",
  contentHash: "hash-1",
  entityType: "post",
  metadata: { title: "Post", status: "draft", slug: "post" },
  frontmatter: { title: "Post", status: "draft", excerpt: "E", author: "A" },
  body: "Body",
};

describe("blogViewSchema", () => {
  it("parses the stored entity with its link fields left null", () => {
    const view = blogViewSchema.parse(input);

    expect(Object.keys(view)).toEqual([
      "id",
      "entityType",
      "content",
      "created",
      "updated",
      "visibility",
      "metadata",
      "contentHash",
      "frontmatter",
      "body",
      "url",
      "typeLabel",
      "listUrl",
      "listLabel",
      "seriesUrl",
      "coverImageUrl",
      "ogImageUrl",
      "coverImageWidth",
      "coverImageHeight",
      "coverImageSrcset",
      "coverImageSizes",
    ]);
    expect(view).toMatchObject({
      id: "item-1",
      entityType: "post",
      content: "---\n---\nBody",
      created: "2026-01-01",
      updated: "2026-01-02",
      visibility: "shared",
      contentHash: "hash-1",
      url: null,
      typeLabel: null,
      listUrl: null,
      listLabel: null,
    });
  });

  it("rejects another entity type or a missing stored field", () => {
    expect(
      blogViewSchema.safeParse({ ...input, entityType: "deck" }).success,
    ).toBe(false);
    const { contentHash: _contentHash, ...withoutHash } = input;
    expect(blogViewSchema.safeParse(withoutHash).success).toBe(false);
  });

  it("requires the link fields once rendered", () => {
    const view = blogViewSchema.parse(input);

    expect(blogRenderSchema.safeParse(view).success).toBe(false);
    expect(
      blogRenderSchema.parse({
        ...view,
        url: "/items/item-1",
        typeLabel: "Item",
        listUrl: "/items",
        listLabel: "Items",
      }),
    ).toMatchObject({
      url: "/items/item-1",
      typeLabel: "Item",
      listUrl: "/items",
      listLabel: "Items",
    });
  });
});
