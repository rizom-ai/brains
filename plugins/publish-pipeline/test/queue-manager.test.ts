import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { QueueManager } from "../src/queue-manager";

describe("QueueManager", () => {
  let queueManager: QueueManager;

  beforeEach(() => {
    queueManager = QueueManager.createFresh();
  });

  describe("add", () => {
    it("should add entity to queue and return position", async () => {
      const result = await queueManager.add("blog-post", "post-1");

      expect(result.position).toBe(1);
    });

    it("should assign sequential positions", async () => {
      await queueManager.add("blog-post", "post-1");
      const result2 = await queueManager.add("blog-post", "post-2");
      const result3 = await queueManager.add("blog-post", "post-3");

      expect(result2.position).toBe(2);
      expect(result3.position).toBe(3);
    });

    it("should maintain separate queues per entity type", async () => {
      const blogResult = await queueManager.add("blog-post", "post-1");
      const deckResult = await queueManager.add("deck", "deck-1");

      expect(blogResult.position).toBe(1);
      expect(deckResult.position).toBe(1);
    });

    it("should not add duplicate entity to same queue", async () => {
      await queueManager.add("blog-post", "post-1");
      const result2 = await queueManager.add("blog-post", "post-1");

      expect(result2.position).toBe(1);

      const queue = await queueManager.list("blog-post");
      expect(queue.length).toBe(1);
    });
  });

  describe("remove", () => {
    it("should remove entity from queue", async () => {
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("blog-post", "post-2");

      await queueManager.remove("blog-post", "post-1");

      const queue = await queueManager.list("blog-post");
      expect(queue.length).toBe(1);
      expect(queue[0]?.entityId).toBe("post-2");
    });

    it("should handle removing non-existent entity", async () => {
      // Should not throw when removing non-existent entity
      await queueManager.remove("blog-post", "non-existent");
      // If we get here, the test passes (no error thrown)
    });
  });

  describe("reorder", () => {
    it("should move entity to new position", async () => {
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("blog-post", "post-2");
      await queueManager.add("blog-post", "post-3");

      await queueManager.reorder("blog-post", "post-3", 1);

      const queue = await queueManager.list("blog-post");
      expect(queue[0]?.entityId).toBe("post-3");
      expect(queue[1]?.entityId).toBe("post-1");
      expect(queue[2]?.entityId).toBe("post-2");
    });

    it("should clamp position to valid range", async () => {
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("blog-post", "post-2");

      await queueManager.reorder("blog-post", "post-2", 100);

      const queue = await queueManager.list("blog-post");
      expect(queue[queue.length - 1]?.entityId).toBe("post-2");
    });
  });

  describe("list", () => {
    it("should return empty array for non-existent queue", async () => {
      const queue = await queueManager.list("non-existent");

      expect(queue).toEqual([]);
    });

    it("should return queue entries in order", async () => {
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("blog-post", "post-2");

      const queue = await queueManager.list("blog-post");

      expect(queue.length).toBe(2);
      expect(queue[0]?.position).toBe(1);
      expect(queue[1]?.position).toBe(2);
    });

    it("should include queuedAt timestamp", async () => {
      await queueManager.add("blog-post", "post-1");

      const queue = await queueManager.list("blog-post");

      expect(queue[0]?.queuedAt).toBeDefined();
      expect(typeof queue[0]?.queuedAt).toBe("string");
    });
  });

  describe("getNext", () => {
    it("should return first entry in queue", async () => {
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("blog-post", "post-2");

      const next = await queueManager.getNext("blog-post");

      expect(next?.entityId).toBe("post-1");
    });

    it("should return null for empty queue", async () => {
      const next = await queueManager.getNext("blog-post");

      expect(next).toBeNull();
    });
  });

  describe("getNextAcrossTypes", () => {
    it("should return oldest queued entry across all types", async () => {
      // Add to blog queue first
      await queueManager.add("blog-post", "post-1");
      // Wait a bit and add to deck queue
      await new Promise((resolve) => setTimeout(resolve, 10));
      await queueManager.add("deck", "deck-1");

      const next = await queueManager.getNextAcrossTypes();

      expect(next?.entityId).toBe("post-1");
      expect(next?.entityType).toBe("blog-post");
    });

    it("should return null when all queues are empty", async () => {
      const next = await queueManager.getNextAcrossTypes();

      expect(next).toBeNull();
    });
  });

  describe("popNext", () => {
    it("should return and remove first entry", async () => {
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("blog-post", "post-2");

      const popped = await queueManager.popNext("blog-post");

      expect(popped?.entityId).toBe("post-1");

      const queue = await queueManager.list("blog-post");
      expect(queue.length).toBe(1);
      expect(queue[0]?.entityId).toBe("post-2");
    });
  });

  describe("getRegisteredTypes", () => {
    it("should return all entity types with queues", async () => {
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("deck", "deck-1");

      const types = queueManager.getRegisteredTypes();

      expect(types).toContain("blog-post");
      expect(types).toContain("deck");
    });
  });

  describe("getQueuedEntityTypes", () => {
    it("should return entity types that have items in queue", async () => {
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("deck", "deck-1");

      const types = await queueManager.getQueuedEntityTypes();

      expect(types).toContain("blog-post");
      expect(types).toContain("deck");
    });

    it("should not return entity types with empty queues", async () => {
      await queueManager.add("blog-post", "post-1");
      await queueManager.add("deck", "deck-1");
      await queueManager.remove("deck", "deck-1");

      const types = await queueManager.getQueuedEntityTypes();

      expect(types).toContain("blog-post");
      expect(types).not.toContain("deck");
    });

    it("should return empty array when no queues have items", async () => {
      const types = await queueManager.getQueuedEntityTypes();

      expect(types).toEqual([]);
    });
  });

  describe("singleton pattern", () => {
    it("should return same instance from getInstance", () => {
      const instance1 = QueueManager.getInstance();
      const instance2 = QueueManager.getInstance();

      expect(instance1).toBe(instance2);
    });

    it("should return fresh instance after reset", () => {
      const instance1 = QueueManager.getInstance();
      QueueManager.resetInstance();
      const instance2 = QueueManager.getInstance();

      expect(instance1).not.toBe(instance2);
    });

    // Clean up singleton after tests
    afterEach(() => {
      QueueManager.resetInstance();
    });
  });
});
