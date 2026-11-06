import { describe, expect, it } from "bun:test";
import {
  projectRenderSchema,
  projectViewSchema,
} from "../src/templates/project-view";

const input = {
  id: "item-1",
  content: "---\n---\nBody",
  created: "2026-01-01",
  updated: "2026-01-02",
  visibility: "shared",
  contentHash: "hash-1",
  entityType: "project",
  metadata: { title: "Project", status: "draft", year: 2026, slug: "project" },
  frontmatter: {
    title: "Project",
    status: "draft",
    description: "D",
    year: 2026,
  },
  body: "Body",
};

describe("projectViewSchema", () => {
  it("parses the stored entity with its link fields left null", () => {
    const view = projectViewSchema.parse(input);

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
      "structuredContent",
      "url",
      "typeLabel",
      "coverImageUrl",
      "ogImageUrl",
      "coverImageWidth",
      "coverImageHeight",
    ]);
    expect(view).toMatchObject({
      id: "item-1",
      entityType: "project",
      content: "---\n---\nBody",
      created: "2026-01-01",
      updated: "2026-01-02",
      visibility: "shared",
      contentHash: "hash-1",
      url: null,
      typeLabel: null,
    });
  });

  it("rejects another entity type or a missing stored field", () => {
    expect(
      projectViewSchema.safeParse({ ...input, entityType: "post" }).success,
    ).toBe(false);
    const { contentHash: _contentHash, ...withoutHash } = input;
    expect(projectViewSchema.safeParse(withoutHash).success).toBe(false);
  });

  it("requires the link fields once rendered", () => {
    const view = projectViewSchema.parse(input);

    expect(projectRenderSchema.safeParse(view).success).toBe(false);
    expect(
      projectRenderSchema.parse({
        ...view,
        url: "/items/item-1",
        typeLabel: "Item",
      }),
    ).toMatchObject({
      url: "/items/item-1",
      typeLabel: "Item",
    });
  });
});
