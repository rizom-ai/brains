import { describe, expect, it } from "bun:test";
import {
  buildGuideAtprotoRecord,
  guideAtproto,
} from "../src/atproto-projection";

const entity: Parameters<typeof buildGuideAtprotoRecord>[0]["entity"] = {
  id: "writer",
  entityType: "guide",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  content: "## Start\n\nBring your drafts.",
  metadata: {
    title: "Moving in as a writer",
    slug: "writer",
    order: 2,
    persona: "Writer",
    for: "You write essays and keep notes.",
    recipe: null,
    brings: null,
    section: "Guides",
    summary: "Drafts, notes and a site.",
    material: [],
  },
};

function recordInput(
  overrides: Partial<Parameters<typeof buildGuideAtprotoRecord>[0]> = {},
): Parameters<typeof buildGuideAtprotoRecord>[0] {
  return {
    entity,
    config: {},
    dryRun: false,
    entities: {
      get: async () => null,
      list: async () => [],
      count: async () => 0,
      readBytes: async () => null,
    },
    uploadBlob: async (): Promise<never> => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("guide ATProto projection", () => {
  it("maps a guide to an ai.rizom.brain.guide record", async () => {
    const record = await buildGuideAtprotoRecord(
      recordInput({
        config: { brainDid: "did:web:brain.example.com" },
        pageUrl: "https://brain.example.com/guide/writer",
      }),
    );

    expect(record).toEqual({
      $type: "ai.rizom.brain.guide",
      title: "Moving in as a writer",
      summary: "Drafts, notes and a site.",
      persona: "Writer",
      for: "You write essays and keep notes.",
      section: "Guides",
      order: 2,
      body: "## Start\n\nBring your drafts.",
      format: "text/markdown",
      canonicalUrl: "https://brain.example.com/guide/writer",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "guide",
      sourceEntityId: "writer",
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("leaves out the summary and section a guide does not state", async () => {
    const record = await buildGuideAtprotoRecord(
      recordInput({
        entity: {
          ...entity,
          metadata: { ...entity.metadata, summary: null, section: null },
        },
      }),
    );

    expect(Object.keys(record)).not.toContain("summary");
    expect(Object.keys(record)).not.toContain("section");
  });

  it("publishes under the canonical guide lexicon", () => {
    expect(guideAtproto.lexicon.id).toBe("ai.rizom.brain.guide");
  });
});
