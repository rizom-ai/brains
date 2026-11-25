import { describe, expect, it } from "bun:test";
import { buildDocAtprotoRecord, docAtproto } from "../src/atproto-projection";

const entity: Parameters<typeof buildDocAtprotoRecord>[0]["entity"] = {
  id: "getting-started",
  entityType: "doc",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  content: "# Getting started\n\nInstall the brain.",
  metadata: {
    title: "Getting started",
    section: "Start here",
    order: 1,
    description: "The first ten minutes.",
    slug: "getting-started",
  },
};

function recordInput(
  overrides: Partial<Parameters<typeof buildDocAtprotoRecord>[0]> = {},
): Parameters<typeof buildDocAtprotoRecord>[0] {
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

describe("doc ATProto projection", () => {
  it("maps a doc to an ai.rizom.brain.doc record", async () => {
    const record = await buildDocAtprotoRecord(
      recordInput({
        config: { brainDid: "did:web:brain.example.com" },
        pageUrl: "https://brain.example.com/doc/getting-started",
      }),
    );

    expect(record).toEqual({
      $type: "ai.rizom.brain.doc",
      title: "Getting started",
      description: "The first ten minutes.",
      section: "Start here",
      order: 1,
      body: "# Getting started\n\nInstall the brain.",
      format: "text/markdown",
      canonicalUrl: "https://brain.example.com/doc/getting-started",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "doc",
      sourceEntityId: "getting-started",
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("leaves out a description the doc does not have", async () => {
    const record = await buildDocAtprotoRecord(
      recordInput({
        entity: {
          ...entity,
          metadata: { ...entity.metadata, description: null },
        },
      }),
    );

    expect(Object.keys(record)).not.toContain("description");
  });

  it("publishes under the canonical doc lexicon", () => {
    expect(docAtproto.lexicon.id).toBe("ai.rizom.brain.doc");
  });
});
