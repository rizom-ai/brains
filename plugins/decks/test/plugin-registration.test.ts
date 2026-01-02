import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { DecksPlugin } from "../src/plugin";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";
import type { DeckEntity } from "../src/schemas/deck";

const sampleDraftDeck: DeckEntity = {
  id: "deck-1",
  entityType: "deck",
  content: `---
title: Test Deck
status: draft
---
# Slide 1`,
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

describe("DecksPlugin - Publish Pipeline Integration", () => {
  let plugin: DecksPlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger, dataDir: "/tmp/test-decks" });
    receivedMessages = [];

    const messageBus = mockShell.getMessageBus();
    messageBus.subscribe("publish:register", async (msg) => {
      receivedMessages.push({ type: "publish:register", payload: msg.payload });
      return { success: true };
    });
    messageBus.subscribe("publish:report:success", async (msg) => {
      receivedMessages.push({
        type: "publish:report:success",
        payload: msg.payload,
      });
      return { success: true };
    });
    messageBus.subscribe("publish:report:failure", async (msg) => {
      receivedMessages.push({
        type: "publish:report:failure",
        payload: msg.payload,
      });
      return { success: true };
    });
  });

  afterEach(async () => {
    mock.restore();
  });

  describe("provider registration", () => {
    it("should send publish:register message on init with internal provider", async () => {
      plugin = new DecksPlugin();
      await plugin.register(mockShell);

      const registerMessage = receivedMessages.find(
        (m) => m.type === "publish:register",
      );
      expect(registerMessage).toBeDefined();
      expect(registerMessage?.payload).toMatchObject({
        entityType: "deck",
        provider: { name: "internal" },
      });
    });
  });

  describe("publish:execute handler", () => {
    it("should subscribe to publish:execute messages", async () => {
      plugin = new DecksPlugin();
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      const response = await messageBus.send(
        "publish:execute",
        { entityType: "deck", entityId: "non-existent" },
        "test",
      );

      expect(response).toMatchObject({ success: true });
    });

    it("should report failure when entity not found", async () => {
      plugin = new DecksPlugin();
      await plugin.register(mockShell);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "deck", entityId: "non-existent" },
        "test",
      );

      const failureMessage = receivedMessages.find(
        (m) => m.type === "publish:report:failure",
      );
      expect(failureMessage).toBeDefined();
      expect(failureMessage?.payload).toMatchObject({
        entityType: "deck",
        entityId: "non-existent",
      });
    });

    it("should report success when publishing draft deck", async () => {
      plugin = new DecksPlugin();
      await plugin.register(mockShell);

      const entityService = mockShell.getEntityService();
      await entityService.createEntity(sampleDraftDeck);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send(
        "publish:execute",
        { entityType: "deck", entityId: "deck-1" },
        "test",
      );

      const successMessage = receivedMessages.find(
        (m) => m.type === "publish:report:success",
      );
      expect(successMessage).toBeDefined();
      expect(successMessage?.payload).toMatchObject({
        entityType: "deck",
        entityId: "deck-1",
      });

      const updatedDeck = await entityService.getEntity<DeckEntity>(
        "deck",
        "deck-1",
      );
      expect(updatedDeck?.metadata.status).toBe("published");
    });
  });
});
