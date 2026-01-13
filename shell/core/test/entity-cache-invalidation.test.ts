import { describe, it, expect, beforeEach, mock } from "bun:test";
import { MessageBus } from "@brains/messaging-service";
import { createSilentLogger } from "@brains/test-utils";

/**
 * Tests for entity cache invalidation subscription pattern.
 *
 * When identity or profile entities change (created/updated/deleted),
 * their respective services need to refresh their caches.
 *
 * This test verifies the behavior that will be extracted into a
 * reusable helper function.
 */
describe("Entity cache invalidation", () => {
  let messageBus: MessageBus;
  const logger = createSilentLogger();

  // Helper to send entity events via the public API
  // Entity events are broadcast (all handlers receive them)
  const sendEntityEvent = async (
    eventType: string,
    entityType: string,
    entityId: string,
  ): Promise<void> => {
    await messageBus.send(
      eventType,
      { entityType, entityId },
      "test", // sender
      undefined, // target
      undefined, // metadata
      true, // broadcast - all handlers receive the message
    );
  };

  beforeEach(() => {
    MessageBus.resetInstance();
    messageBus = MessageBus.createFresh(logger);
  });

  describe("identity service cache refresh", () => {
    it("should refresh cache when identity entity is created", async () => {
      const refreshCache = mock(() => Promise.resolve());

      // Subscribe to entity:created for identity
      messageBus.subscribe<{ entityType: string; entityId: string }, void>(
        "entity:created",
        async (message) => {
          if (
            message.payload.entityType === "identity" &&
            message.payload.entityId === "identity"
          ) {
            await refreshCache();
          }
          return { success: true };
        },
      );

      // Send identity entity created event
      await sendEntityEvent("entity:created", "identity", "identity");

      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache when identity entity is updated", async () => {
      const refreshCache = mock(() => Promise.resolve());

      messageBus.subscribe<{ entityType: string; entityId: string }, void>(
        "entity:updated",
        async (message) => {
          if (
            message.payload.entityType === "identity" &&
            message.payload.entityId === "identity"
          ) {
            await refreshCache();
          }
          return { success: true };
        },
      );

      await sendEntityEvent("entity:updated", "identity", "identity");

      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache when identity entity is deleted", async () => {
      const refreshCache = mock(() => Promise.resolve());

      messageBus.subscribe<{ entityType: string; entityId: string }, void>(
        "entity:deleted",
        async (message) => {
          if (
            message.payload.entityType === "identity" &&
            message.payload.entityId === "identity"
          ) {
            await refreshCache();
          }
          return { success: true };
        },
      );

      await sendEntityEvent("entity:deleted", "identity", "identity");

      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should NOT refresh cache for non-identity entities", async () => {
      const refreshCache = mock(() => Promise.resolve());

      messageBus.subscribe<{ entityType: string; entityId: string }, void>(
        "entity:created",
        async (message) => {
          if (
            message.payload.entityType === "identity" &&
            message.payload.entityId === "identity"
          ) {
            await refreshCache();
          }
          return { success: true };
        },
      );

      // Send non-identity entity events
      await sendEntityEvent("entity:created", "note", "note-123");
      await sendEntityEvent("entity:created", "profile", "profile");

      expect(refreshCache).toHaveBeenCalledTimes(0);
    });
  });

  describe("profile service cache refresh", () => {
    it("should refresh cache when profile entity is created", async () => {
      const refreshCache = mock(() => Promise.resolve());

      messageBus.subscribe<{ entityType: string; entityId: string }, void>(
        "entity:created",
        async (message) => {
          if (
            message.payload.entityType === "profile" &&
            message.payload.entityId === "profile"
          ) {
            await refreshCache();
          }
          return { success: true };
        },
      );

      await sendEntityEvent("entity:created", "profile", "profile");

      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache when profile entity is updated", async () => {
      const refreshCache = mock(() => Promise.resolve());

      messageBus.subscribe<{ entityType: string; entityId: string }, void>(
        "entity:updated",
        async (message) => {
          if (
            message.payload.entityType === "profile" &&
            message.payload.entityId === "profile"
          ) {
            await refreshCache();
          }
          return { success: true };
        },
      );

      await sendEntityEvent("entity:updated", "profile", "profile");

      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should refresh cache when profile entity is deleted", async () => {
      const refreshCache = mock(() => Promise.resolve());

      messageBus.subscribe<{ entityType: string; entityId: string }, void>(
        "entity:deleted",
        async (message) => {
          if (
            message.payload.entityType === "profile" &&
            message.payload.entityId === "profile"
          ) {
            await refreshCache();
          }
          return { success: true };
        },
      );

      await sendEntityEvent("entity:deleted", "profile", "profile");

      expect(refreshCache).toHaveBeenCalledTimes(1);
    });

    it("should NOT refresh cache for non-profile entities", async () => {
      const refreshCache = mock(() => Promise.resolve());

      messageBus.subscribe<{ entityType: string; entityId: string }, void>(
        "entity:updated",
        async (message) => {
          if (
            message.payload.entityType === "profile" &&
            message.payload.entityId === "profile"
          ) {
            await refreshCache();
          }
          return { success: true };
        },
      );

      await sendEntityEvent("entity:updated", "identity", "identity");
      await sendEntityEvent("entity:updated", "post", "post-123");

      expect(refreshCache).toHaveBeenCalledTimes(0);
    });
  });

  describe("multiple entity types with independent caches", () => {
    it("should refresh only the matching service cache", async () => {
      const identityRefresh = mock(() => Promise.resolve());
      const profileRefresh = mock(() => Promise.resolve());

      // Subscribe both identity and profile handlers
      messageBus.subscribe<{ entityType: string; entityId: string }, void>(
        "entity:updated",
        async (message) => {
          if (
            message.payload.entityType === "identity" &&
            message.payload.entityId === "identity"
          ) {
            await identityRefresh();
          }
          return { success: true };
        },
      );

      messageBus.subscribe<{ entityType: string; entityId: string }, void>(
        "entity:updated",
        async (message) => {
          if (
            message.payload.entityType === "profile" &&
            message.payload.entityId === "profile"
          ) {
            await profileRefresh();
          }
          return { success: true };
        },
      );

      // Update identity - only identity cache should refresh
      await sendEntityEvent("entity:updated", "identity", "identity");

      expect(identityRefresh).toHaveBeenCalledTimes(1);
      expect(profileRefresh).toHaveBeenCalledTimes(0);

      // Update profile - only profile cache should refresh
      await sendEntityEvent("entity:updated", "profile", "profile");

      expect(identityRefresh).toHaveBeenCalledTimes(1);
      expect(profileRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
