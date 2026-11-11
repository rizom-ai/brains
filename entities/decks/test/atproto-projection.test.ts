import { describe, expect, it } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { buildDeckAtprotoRecord } from "../src/atproto-projection";
import { decksPlugin } from "./decks-plugin";

// A deck as a declared type reads it: its metadata and its slides.
const deck: Parameters<typeof buildDeckAtprotoRecord>[0]["entity"] = {
  id: "deck-1",
  entityType: "deck",
  content: "# Network Deck\n\n---\n\n## Slide Two",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: {
    title: "Network Deck",
    slug: "network-deck",
    authoredSlug: true,
    description: "A deck about networks.",
    author: "Ada",
    status: "published",
    publishedAt: "2026-05-28T10:00:00.000Z",
    event: "Rizom Summit",
  },
};

function recordInput(
  overrides: Partial<Parameters<typeof buildDeckAtprotoRecord>[0]> = {},
): Parameters<typeof buildDeckAtprotoRecord>[0] {
  return {
    entity: deck,
    config: {},
    dryRun: false,
    entities: {
      get: async () => null,
      list: async () => [],
      count: async () => 0,
    },
    uploadBlob: async (): Promise<never> => {
      throw new Error("not used");
    },
    ...overrides,
  };
}

describe("deck ATProto projection", () => {
  it("maps decks to ai.rizom.brain.deck records", async () => {
    const record = await buildDeckAtprotoRecord(
      recordInput({ config: { brainDid: "did:web:brain.example.com" } }),
    );

    expect(record).toEqual({
      $type: "ai.rizom.brain.deck",
      title: "Network Deck",
      slug: "network-deck",
      description: "A deck about networks.",
      body: "# Network Deck\n\n---\n\n## Slide Two",
      format: "text/markdown",
      author: "Ada",
      event: "Rizom Summit",
      publishedAt: "2026-05-28T10:00:00.000Z",
      brainDid: "did:web:brain.example.com",
      sourceEntityType: "deck",
      sourceEntityId: "deck-1",
      createdAt: "2026-05-28T09:00:00.000Z",
      updatedAt: "2026-05-28T11:00:00.000Z",
    });
  });

  it("names its page when the site gives the deck one, and nothing otherwise", async () => {
    const placed = await buildDeckAtprotoRecord(
      recordInput({ pageUrl: "https://brain.example.com/decks/deck-1" }),
    );
    expect(placed.canonicalUrl).toBe("https://brain.example.com/decks/deck-1");
    const unplaced = await buildDeckAtprotoRecord(recordInput());
    expect(unplaced.canonicalUrl).toBeUndefined();
  });

  it("registers the deck projection when the decks plugin registers", async () => {
    const harness = createPluginHarness({ dataDir: "/tmp/test-deck-atproto" });
    await harness.installPlugin(decksPlugin());

    const projection = harness
      .getMockShell()
      .getAtprotoProjectionRegistry()
      .get("deck");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.deck");
  });
});
