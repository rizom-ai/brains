import { describe, expect, it } from "bun:test";
import {
  deckRenderSchema,
  deckViewSchema,
} from "../src/templates/deck-view-schema";

const input = {
  id: "item-1",
  content: "---\n---\nBody",
  created: "2026-01-01",
  updated: "2026-01-02",
  visibility: "shared",
  contentHash: "hash-1",
  entityType: "deck",
  metadata: { title: "Deck", status: "draft", slug: "deck" },
  frontmatter: { title: "Deck", status: "draft" },
  body: "Body",
};

describe("deckViewSchema", () => {
  it("parses the stored entity with its link fields left null", () => {
    const view = deckViewSchema.parse(input);

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
      "coverImageUrl",
      "ogImageUrl",
      "coverImageWidth",
      "coverImageHeight",
    ]);
    expect(view).toMatchObject({
      id: "item-1",
      entityType: "deck",
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
      deckViewSchema.safeParse({ ...input, entityType: "post" }).success,
    ).toBe(false);
    const { contentHash: _contentHash, ...withoutHash } = input;
    expect(deckViewSchema.safeParse(withoutHash).success).toBe(false);
  });

  it("requires the link fields once rendered", () => {
    const view = deckViewSchema.parse(input);

    expect(deckRenderSchema.safeParse(view).success).toBe(false);
    expect(
      deckRenderSchema.parse({
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
