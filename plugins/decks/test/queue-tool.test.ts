import { describe, it, expect, beforeEach, mock } from "bun:test";
import { createQueueTool } from "../src/tools/queue";
import type { ServicePluginContext, ToolContext } from "@brains/plugins";
import type { DeckEntity } from "../src/schemas/deck";

const nullToolContext = null as unknown as ToolContext;

const sampleQueuedDeck: DeckEntity = {
  id: "deck-1",
  entityType: "deck",
  content: `---
title: Test Deck
status: queued
---
# Slide 1`,
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  title: "Test Deck",
  status: "queued",
  metadata: {
    title: "Test Deck",
    slug: "test-deck",
    status: "queued",
  },
};

const sampleDraftDeck: DeckEntity = {
  ...sampleQueuedDeck,
  id: "deck-2",
  status: "draft",
  metadata: { ...sampleQueuedDeck.metadata, status: "draft" },
};

describe("Decks Queue Tool", () => {
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

  describe("list action", () => {
    it("should send publish:list message", async () => {
      const tool = createQueueTool(context, "decks");
      await tool.handler({ action: "list" }, nullToolContext);

      expect(sentMessages).toContainEqual({
        channel: "publish:list",
        payload: { entityType: "deck" },
      });
    });
  });

  describe("remove action", () => {
    it("should send publish:remove message for queued deck", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleQueuedDeck));

      const tool = createQueueTool(context, "decks");
      await tool.handler({ action: "remove", id: "deck-1" }, nullToolContext);

      expect(sentMessages).toContainEqual({
        channel: "publish:remove",
        payload: { entityType: "deck", entityId: "deck-1" },
      });
    });

    it("should not send message if deck is not queued", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleDraftDeck));

      const tool = createQueueTool(context, "decks");
      const result = await tool.handler(
        { action: "remove", id: "deck-2" },
        nullToolContext,
      );

      expect(result.success).toBe(false);
      expect(result["error"]).toContain("not in queue");
    });
  });

  describe("reorder action", () => {
    it("should send publish:reorder message for queued deck", async () => {
      (
        context.entityService.getEntity as ReturnType<typeof mock>
      ).mockImplementation(() => Promise.resolve(sampleQueuedDeck));

      const tool = createQueueTool(context, "decks");
      await tool.handler(
        { action: "reorder", id: "deck-1", position: 3 },
        nullToolContext,
      );

      expect(sentMessages).toContainEqual({
        channel: "publish:reorder",
        payload: { entityType: "deck", entityId: "deck-1", position: 3 },
      });
    });
  });
});
