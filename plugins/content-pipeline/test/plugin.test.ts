import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentPipelinePlugin } from "../src/plugin";
import { PUBLISH_MESSAGES } from "../src/types/messages";
import type { PublishProvider } from "@brains/utils";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";

describe("ContentPipelinePlugin", () => {
  let plugin: ContentPipelinePlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger, dataDir: "/tmp/test-datadir" });
    plugin = new ContentPipelinePlugin({});
    await plugin.register(mockShell);
  });

  afterEach(async () => {
    await plugin.cleanup();
    mock.restore();
  });

  describe("initialization", () => {
    it("should be instantiable", () => {
      expect(plugin).toBeDefined();
    });

    it("should have correct plugin id", () => {
      expect(plugin.id).toBe("content-pipeline");
    });

    it("should initialize components", () => {
      expect(plugin.getQueueManager()).toBeDefined();
      expect(plugin.getProviderRegistry()).toBeDefined();
      expect(plugin.getRetryTracker()).toBeDefined();
      expect(plugin.getScheduler()).toBeDefined();
    });
  });

  describe("queue operations via message bus", () => {
    it("should add entity to queue", async () => {
      const messageBus = mockShell.getMessageBus();
      const result = await messageBus.send(
        PUBLISH_MESSAGES.QUEUE,
        { entityType: "blog-post", entityId: "post-1" },
        "test",
      );

      expect(result).toMatchObject({ success: true });

      const queue = await plugin.getQueueManager().list("blog-post");
      expect(queue.length).toBe(1);
      expect(queue[0]?.entityId).toBe("post-1");
    });

    it("should remove entity from queue", async () => {
      const messageBus = mockShell.getMessageBus();

      await messageBus.send(
        PUBLISH_MESSAGES.QUEUE,
        { entityType: "blog-post", entityId: "post-1" },
        "test",
      );

      await messageBus.send(
        PUBLISH_MESSAGES.REMOVE,
        { entityType: "blog-post", entityId: "post-1" },
        "test",
      );

      const queue = await plugin.getQueueManager().list("blog-post");
      expect(queue.length).toBe(0);
    });

    it("should reorder entities in queue", async () => {
      const messageBus = mockShell.getMessageBus();

      await messageBus.send(
        PUBLISH_MESSAGES.QUEUE,
        { entityType: "blog-post", entityId: "post-1" },
        "test",
      );
      await messageBus.send(
        PUBLISH_MESSAGES.QUEUE,
        { entityType: "blog-post", entityId: "post-2" },
        "test",
      );

      await messageBus.send(
        PUBLISH_MESSAGES.REORDER,
        { entityType: "blog-post", entityId: "post-2", position: 1 },
        "test",
      );

      const queue = await plugin.getQueueManager().list("blog-post");
      expect(queue[0]?.entityId).toBe("post-2");
    });
  });

  describe("queue rebuild on startup", () => {
    it("should rebuild queue from queued entities after sync:initial:completed", async () => {
      // Pre-populate with queued entities (addEntities registers the entity type)
      mockShell.addEntities([
        {
          id: "post-1",
          entityType: "social-post",
          content: "queued post 1",
          metadata: { status: "queued", title: "Post 1" },
          contentHash: "h1",
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-01T00:00:00Z",
        },
        {
          id: "post-2",
          entityType: "social-post",
          content: "queued post 2",
          metadata: { status: "queued", title: "Post 2" },
          contentHash: "h2",
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-01T00:00:00Z",
        },
        {
          id: "post-3",
          entityType: "social-post",
          content: "draft post",
          metadata: { status: "draft", title: "Post 3" },
          contentHash: "h3",
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-01T00:00:00Z",
        },
      ]);

      // Simulate sync completion
      const messageBus = mockShell.getMessageBus();
      await messageBus.send("sync:initial:completed", {}, "test");

      // Queue should contain only the queued entities
      const queue = await plugin.getQueueManager().list("social-post");
      expect(queue.length).toBe(2);
      const queuedIds = queue.map((e) => e.entityId);
      expect(queuedIds).toContain("post-1");
      expect(queuedIds).toContain("post-2");
    });

    it("should not add non-queued entities to queue", async () => {
      mockShell.addEntities([
        {
          id: "post-1",
          entityType: "social-post",
          content: "published post",
          metadata: { status: "published", title: "Post 1" },
          contentHash: "h1",
          created: "2024-01-01T00:00:00Z",
          updated: "2024-01-01T00:00:00Z",
        },
      ]);

      const messageBus = mockShell.getMessageBus();
      await messageBus.send("sync:initial:completed", {}, "test");

      const queue = await plugin.getQueueManager().list("social-post");
      expect(queue.length).toBe(0);
    });

    it("should handle no queued entities gracefully", async () => {
      const messageBus = mockShell.getMessageBus();
      await messageBus.send("sync:initial:completed", {}, "test");

      // No crash, empty queue
      const queue = await plugin.getQueueManager().list("social-post");
      expect(queue.length).toBe(0);
    });
  });

  describe("provider registration", () => {
    it("should register provider for entity type", async () => {
      const messageBus = mockShell.getMessageBus();
      const provider: PublishProvider = {
        name: "test-provider",
        publish: async () => ({ id: "result" }),
      };

      await messageBus.send(
        PUBLISH_MESSAGES.REGISTER,
        { entityType: "blog-post", provider },
        "test",
      );

      expect(plugin.getProviderRegistry().has("blog-post")).toBe(true);
    });
  });
});
