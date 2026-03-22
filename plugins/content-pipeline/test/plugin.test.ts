import { describe, it, expect, beforeEach } from "bun:test";
import { ContentPipelinePlugin } from "../src/plugin";
import { PUBLISH_MESSAGES } from "../src/types/messages";
import type { PublishProvider } from "@brains/utils";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

describe("ContentPipelinePlugin", () => {
  let harness: PluginTestHarness<ContentPipelinePlugin>;
  let plugin: ContentPipelinePlugin;

  beforeEach(async () => {
    harness = createPluginHarness({ dataDir: "/tmp/test-datadir" });
    plugin = new ContentPipelinePlugin({});
    await harness.installPlugin(plugin);
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
      await harness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-1",
      });

      const queue = await plugin.getQueueManager().list("blog-post");
      expect(queue.length).toBe(1);
      expect(queue[0]?.entityId).toBe("post-1");
    });

    it("should remove entity from queue", async () => {
      await harness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-1",
      });

      await harness.sendMessage(PUBLISH_MESSAGES.REMOVE, {
        entityType: "blog-post",
        entityId: "post-1",
      });

      const queue = await plugin.getQueueManager().list("blog-post");
      expect(queue.length).toBe(0);
    });

    it("should reorder entities in queue", async () => {
      await harness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-1",
      });
      await harness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
        entityType: "blog-post",
        entityId: "post-2",
      });

      await harness.sendMessage(PUBLISH_MESSAGES.REORDER, {
        entityType: "blog-post",
        entityId: "post-2",
        position: 1,
      });

      const queue = await plugin.getQueueManager().list("blog-post");
      expect(queue[0]?.entityId).toBe("post-2");
    });
  });

  describe("queue rebuild on startup", () => {
    it("should rebuild queue from queued entities after sync:initial:completed", async () => {
      harness.addEntities([
        {
          id: "post-1",
          entityType: "social-post",
          content: "queued post 1",
          metadata: { status: "queued", title: "Post 1" },
        },
        {
          id: "post-2",
          entityType: "social-post",
          content: "queued post 2",
          metadata: { status: "queued", title: "Post 2" },
        },
        {
          id: "post-3",
          entityType: "social-post",
          content: "draft post",
          metadata: { status: "draft", title: "Post 3" },
        },
      ]);

      await harness.sendMessage("sync:initial:completed", {});

      const queue = await plugin.getQueueManager().list("social-post");
      expect(queue.length).toBe(2);
      const queuedIds = queue.map((e) => e.entityId);
      expect(queuedIds).toContain("post-1");
      expect(queuedIds).toContain("post-2");
    });

    it("should not add non-queued entities to queue", async () => {
      harness.addEntities([
        {
          id: "post-1",
          entityType: "social-post",
          content: "published post",
          metadata: { status: "published", title: "Post 1" },
        },
      ]);

      await harness.sendMessage("sync:initial:completed", {});

      const queue = await plugin.getQueueManager().list("social-post");
      expect(queue.length).toBe(0);
    });

    it("should handle no queued entities gracefully", async () => {
      await harness.sendMessage("sync:initial:completed", {});

      const queue = await plugin.getQueueManager().list("social-post");
      expect(queue.length).toBe(0);
    });
  });

  describe("provider registration", () => {
    it("should register provider for entity type", async () => {
      const provider: PublishProvider = {
        name: "test-provider",
        publish: async () => ({ id: "result" }),
      };

      await harness.sendMessage(PUBLISH_MESSAGES.REGISTER, {
        entityType: "blog-post",
        provider,
      });

      expect(plugin.getProviderRegistry().has("blog-post")).toBe(true);
    });
  });
});
