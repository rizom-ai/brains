import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createPublishTool } from "../src/tools/publish";
import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import type { DeckEntity } from "../src/schemas/deck";

const nullToolContext = null as unknown as ToolContext;

const sampleDraftDeck: DeckEntity = {
  id: "deck-1",
  entityType: "deck",
  content: `---
title: Test Deck
status: draft
---

# Slide 1

Content

---

# Slide 2

More content`,
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  title: "Test Deck",
  status: "draft",
  metadata: {
    title: "Test Deck",
    slug: "test-deck",
    status: "draft",
  },
};

describe("Decks Publish Tool - Direct Flag", () => {
  let context: ServicePluginContext;
  let sentMessages: Array<{ channel: string; payload: unknown }>;

  beforeEach(() => {
    sentMessages = [];

    context = {
      entityService: {
        getEntity: mock(() => Promise.resolve(null)),
        listEntities: mock(() => Promise.resolve([])),
        updateEntity: mock(() => Promise.resolve({ entityId: "deck-1" })),
      },
      sendMessage: mock(async (channel: string, payload: unknown) => {
        sentMessages.push({ channel, payload });
        return { success: true };
      }),
    } as unknown as ServicePluginContext;
  });

  describe("direct flag", () => {
    it("should default to direct=true (immediate publish)", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleDraftDeck));

      const tool = createPublishTool(context, "decks");
      const result = await tool.handler({ id: "deck-1" }, nullToolContext);

      expect(result.success).toBe(true);
      const updateCall = (
        context.entityService.updateEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      const updatedDeck = updateCall?.[0] as DeckEntity;
      expect(updatedDeck.metadata.status).toBe("published");
    });

    it("should publish immediately with direct=true", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleDraftDeck));

      const tool = createPublishTool(context, "decks");
      const result = await tool.handler(
        { id: "deck-1", direct: true },
        nullToolContext,
      );

      expect(result.success).toBe(true);
      const updateCall = (
        context.entityService.updateEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      const updatedDeck = updateCall?.[0] as DeckEntity;
      expect(updatedDeck.metadata.status).toBe("published");
    });

    it("should add to queue with direct=false", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleDraftDeck));

      const tool = createPublishTool(context, "decks");
      const result = await tool.handler(
        { id: "deck-1", direct: false },
        nullToolContext,
      );

      expect(result.success).toBe(true);
      const updateCall = (
        context.entityService.updateEntity as ReturnType<typeof mock>
      ).mock.calls[0];
      const updatedDeck = updateCall?.[0] as DeckEntity;
      expect(updatedDeck.metadata.status).toBe("queued");

      // Should send queue message
      expect(sentMessages).toContainEqual({
        channel: "publish:queue",
        payload: { entityType: "deck", entityId: "deck-1" },
      });
    });

    it("should not queue already published decks", async () => {
      const publishedDeck: DeckEntity = {
        ...sampleDraftDeck,
        status: "published",
        metadata: { ...sampleDraftDeck.metadata, status: "published" },
      };
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(publishedDeck));

      const tool = createPublishTool(context, "decks");
      const result = await tool.handler(
        { id: "deck-1", direct: false },
        nullToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("already published");
    });
  });
});
