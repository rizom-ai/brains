import { describe, expect, it } from "bun:test";
import {
  agentRenderSchema,
  agentViewSchema,
} from "../src/templates/agent-view";

const input = {
  id: "item-1",
  content: "---\n---\nBody",
  created: "2026-01-01",
  updated: "2026-01-02",
  visibility: "shared",
  contentHash: "hash-1",
  entityType: "agent",
  metadata: {
    name: "Agent",
    url: "https://agent.example",
    status: "approved",
    slug: "agent",
  },
  frontmatter: {
    name: "Agent",
    kind: "person",
    brainName: "Brain",
    url: "https://agent.example",
    status: "approved",
    discoveredAt: "2026-01-01",
  },
  about: "About",
  skills: [],
  notes: "Notes",
};

describe("agentViewSchema", () => {
  it("parses the stored entity with its link fields left null", () => {
    const view = agentViewSchema.parse(input);

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
      "about",
      "skills",
      "notes",
      "url",
      "typeLabel",
    ]);
    expect(view).toMatchObject({
      id: "item-1",
      entityType: "agent",
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
      agentViewSchema.safeParse({ ...input, entityType: "post" }).success,
    ).toBe(false);
    const { contentHash: _contentHash, ...withoutHash } = input;
    expect(agentViewSchema.safeParse(withoutHash).success).toBe(false);
  });

  it("requires the link fields once rendered", () => {
    const view = agentViewSchema.parse(input);

    expect(agentRenderSchema.safeParse(view).success).toBe(false);
    expect(
      agentRenderSchema.parse({
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
