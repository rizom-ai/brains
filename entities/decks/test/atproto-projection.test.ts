import { describe, expect, it, beforeEach } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { AtprotoProjectionRegistry } from "@brains/atproto-contracts";
import { createDeckAtprotoProjection } from "../src/atproto-projection";
import { DecksPlugin } from "../src/plugin";
import type { DeckEntity } from "../src/schemas/deck";

const deck: DeckEntity = {
  id: "deck-1",
  entityType: "deck",
  content:
    "---\ntitle: Network Deck\nslug: network-deck\ndescription: A deck about networks.\nauthor: Ada\nstatus: published\npublishedAt: 2026-05-28T10:00:00.000Z\nevent: Rizom Summit\n---\n# Network Deck\n\n---\n\n## Slide Two",
  created: "2026-05-28T09:00:00.000Z",
  updated: "2026-05-28T11:00:00.000Z",
  visibility: "public",
  contentHash: "hash",
  metadata: {
    title: "Network Deck",
    slug: "network-deck",
    description: "A deck about networks.",
    status: "published",
    publishedAt: "2026-05-28T10:00:00.000Z",
  },
};

describe("deck ATProto projection", () => {
  beforeEach(() => {
    AtprotoProjectionRegistry.resetInstance();
  });

  it("maps decks to ai.rizom.brain.deck records", async () => {
    const projection = createDeckAtprotoProjection();

    const record = await projection.buildRecord({
      entity: deck,
      context: createPluginHarness().getServiceContext("decks"),
      config: {
        brainDid: "did:web:brain.example.com",
      },
    });

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

  it("registers the deck projection when the decks plugin registers", async () => {
    const harness = createPluginHarness({ dataDir: "/tmp/test-deck-atproto" });
    await harness.installPlugin(new DecksPlugin());

    const projection = AtprotoProjectionRegistry.getInstance().get("deck");

    expect(projection).toBeDefined();
    expect(projection?.collection).toBe("ai.rizom.brain.deck");
  });
});
