import { describe, it, expect, beforeEach, mock } from "bun:test";
import { MessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";

interface EntityPayload {
  entityType: string;
  entityId: string;
}

describe("Entity cache invalidation", () => {
  let messageBus: MessageBus;
  const logger = createSilentLogger();

  function subscribeForEntity(
    eventType: string,
    entityType: string,
    entityId: string,
  ): ReturnType<typeof mock> {
    const refreshCache = mock(() => Promise.resolve());

    messageBus.subscribe<EntityPayload, void>(eventType, async (message) => {
      if (
        message.payload.entityType === entityType &&
        message.payload.entityId === entityId
      ) {
        await refreshCache();
      }
      return { success: true };
    });

    return refreshCache;
  }

  async function sendEntityEvent(
    eventType: string,
    entityType: string,
    entityId: string,
  ): Promise<void> {
    await messageBus.send(
      eventType,
      { entityType, entityId },
      "test",
      undefined,
      undefined,
      true,
    );
  }

  beforeEach(() => {
    MessageBus.resetInstance();
    messageBus = MessageBus.createFresh(logger);
  });

  describe("identity service cache refresh", () => {
    it("should refresh cache when identity entity is created", async () => {
      const refreshCache = subscribeForEntity(
        "entity:created",
        "identity",
        "identity",
      );
      await sendEntityEvent("entity:created", "identity", "identity");
      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache when identity entity is updated", async () => {
      const refreshCache = subscribeForEntity(
        "entity:updated",
        "identity",
        "identity",
      );
      await sendEntityEvent("entity:updated", "identity", "identity");
      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache when identity entity is deleted", async () => {
      const refreshCache = subscribeForEntity(
        "entity:deleted",
        "identity",
        "identity",
      );
      await sendEntityEvent("entity:deleted", "identity", "identity");
      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should NOT refresh cache for non-identity entities", async () => {
      const refreshCache = subscribeForEntity(
        "entity:created",
        "identity",
        "identity",
      );
      await sendEntityEvent("entity:created", "note", "note-123");
      await sendEntityEvent("entity:created", "profile", "profile");
      expect(refreshCache).toHaveBeenCalledTimes(0);
    });
  });

  describe("profile service cache refresh", () => {
    it("should refresh cache when profile entity is created", async () => {
      const refreshCache = subscribeForEntity(
        "entity:created",
        "profile",
        "profile",
      );
      await sendEntityEvent("entity:created", "profile", "profile");
      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache when profile entity is updated", async () => {
      const refreshCache = subscribeForEntity(
        "entity:updated",
        "profile",
        "profile",
      );
      await sendEntityEvent("entity:updated", "profile", "profile");
      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache when profile entity is deleted", async () => {
      const refreshCache = subscribeForEntity(
        "entity:deleted",
        "profile",
        "profile",
      );
      await sendEntityEvent("entity:deleted", "profile", "profile");
      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should NOT refresh cache for non-profile entities", async () => {
      const refreshCache = subscribeForEntity(
        "entity:updated",
        "profile",
        "profile",
      );
      await sendEntityEvent("entity:updated", "identity", "identity");
      await sendEntityEvent("entity:updated", "post", "post-123");
      expect(refreshCache).toHaveBeenCalledTimes(0);
    });
  });

  describe("multiple entity types with independent caches", () => {
    it("should refresh only the matching service cache", async () => {
      const identityRefresh = subscribeForEntity(
        "entity:updated",
        "identity",
        "identity",
      );
      const profileRefresh = subscribeForEntity(
        "entity:updated",
        "profile",
        "profile",
      );

      await sendEntityEvent("entity:updated", "identity", "identity");
      expect(identityRefresh).toHaveBeenCalledTimes(1);
      expect(profileRefresh).toHaveBeenCalledTimes(0);

      await sendEntityEvent("entity:updated", "profile", "profile");
      expect(identityRefresh).toHaveBeenCalledTimes(1);
      expect(profileRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
