import { describe, expect, it } from "bun:test";
import {
  socialPostRenderSchema,
  socialPostViewSchema,
} from "../../src/templates/social-post-view";

const input = {
  id: "item-1",
  content: "---\n---\nBody",
  created: "2026-01-01",
  updated: "2026-01-02",
  visibility: "shared",
  contentHash: "hash-1",
  entityType: "social-post",
  metadata: {
    title: "Post",
    platform: "linkedin",
    status: "draft",
    slug: "post",
  },
  frontmatter: { title: "Post", platform: "linkedin", status: "draft" },
  body: "Body",
};

describe("socialPostViewSchema", () => {
  it("parses the stored entity with its link fields left null", () => {
    const view = socialPostViewSchema.parse(input);

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
      "listUrl",
      "listLabel",
      "typeLabel",
      "coverImageUrl",
      "coverImageWidth",
      "coverImageHeight",
    ]);
    expect(view).toMatchObject({
      id: "item-1",
      entityType: "social-post",
      content: "---\n---\nBody",
      created: "2026-01-01",
      updated: "2026-01-02",
      visibility: "shared",
      contentHash: "hash-1",
      url: null,
      listUrl: null,
      listLabel: null,
      typeLabel: null,
    });
  });

  it("rejects another entity type or a missing stored field", () => {
    expect(
      socialPostViewSchema.safeParse({ ...input, entityType: "post" }).success,
    ).toBe(false);
    const { contentHash: _contentHash, ...withoutHash } = input;
    expect(socialPostViewSchema.safeParse(withoutHash).success).toBe(false);
  });

  it("requires the link fields once rendered", () => {
    const view = socialPostViewSchema.parse(input);

    expect(socialPostRenderSchema.safeParse(view).success).toBe(false);
    expect(
      socialPostRenderSchema.parse({
        ...view,
        url: "/items/item-1",
        listUrl: "/items",
        listLabel: "Items",
        typeLabel: "Item",
      }),
    ).toMatchObject({
      url: "/items/item-1",
      listUrl: "/items",
      listLabel: "Items",
      typeLabel: "Item",
    });
  });
});
