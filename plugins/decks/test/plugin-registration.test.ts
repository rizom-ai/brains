import { describe, it, expect, beforeEach } from "bun:test";
import { DecksPlugin } from "../src/plugin";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type { DeckEntity } from "../src/schemas/deck";

const sampleDraftDeck: DeckEntity = {
  id: "deck-1",
  entityType: "deck",
  content: `---
title: Test Deck
status: draft
slug: test-deck
---
# Slide 1

---

# Slide 2`,
  contentHash: "abc123",
  created: "2024-01-01T00:00:00Z",
  updated: "2024-01-01T00:00:00Z",
  metadata: {
    title: "Test Deck",
    slug: "test-deck",
    status: "draft",
  },
};

describe("DecksPlugin - Publish Pipeline Integration", () => {
  let harness: PluginTestHarness<DecksPlugin>;
  let receivedMessages: Array<{ type: string; payload: unknown }>;

  beforeEach(async () => {
    harness = createPluginHarness<DecksPlugin>({ dataDir: "/tmp/test-decks" });
    receivedMessages = [];

    for (const eventType of [
      "publish:register",
      "publish:report:success",
      "publish:report:failure",
    ]) {
      harness.subscribe(eventType, async (msg) => {
        receivedMessages.push({ type: eventType, payload: msg.payload });
        return { success: true };
      });
    }
  });

  describe("provider registration", () => {
    it("should send publish:register message on init with internal provider", async () => {
      await harness.installPlugin(new DecksPlugin());

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
      await harness.installPlugin(new DecksPlugin());

      // Sending to the channel doesn't throw — the plugin has a handler registered
      await harness.sendMessage("publish:execute", {
        entityType: "deck",
        entityId: "non-existent",
      });

      // The handler ran — we can verify via the failure message it emits
      const failureMessage = receivedMessages.find(
        (m) => m.type === "publish:report:failure",
      );
      expect(failureMessage).toBeDefined();
    });

    it("should report failure when entity not found", async () => {
      await harness.installPlugin(new DecksPlugin());

      await harness.sendMessage("publish:execute", {
        entityType: "deck",
        entityId: "non-existent",
      });

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
      await harness.installPlugin(new DecksPlugin());

      const entityService = harness.getEntityService();
      await entityService.createEntity(sampleDraftDeck);

      await harness.sendMessage("publish:execute", {
        entityType: "deck",
        entityId: "deck-1",
      });

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
