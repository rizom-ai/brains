import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { PublishPipelinePlugin } from "../src/plugin";
import { PUBLISH_MESSAGES } from "../src/types/messages";
import type { PublishProvider } from "@brains/utils";
import { createSilentLogger } from "@brains/test-utils";
import { MockShell } from "@brains/plugins/test";

describe("PublishPipelinePlugin", () => {
  let plugin: PublishPipelinePlugin;
  let mockShell: MockShell;
  let logger: ReturnType<typeof createSilentLogger>;

  beforeEach(async () => {
    logger = createSilentLogger();
    mockShell = MockShell.createFresh({ logger, dataDir: "/tmp/test-datadir" });
    plugin = new PublishPipelinePlugin({ tickIntervalMs: 100 });
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
      expect(plugin.id).toBe("publish-pipeline");
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
