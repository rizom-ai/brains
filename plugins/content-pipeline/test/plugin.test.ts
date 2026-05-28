import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { ContentPipelinePlugin } from "../src/plugin";
import { PUBLISH_MESSAGES } from "../src/types/messages";
import type { PublishProvider } from "@brains/contracts";
import { PermissionService } from "@brains/templates";
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

  afterEach(async () => {
    await plugin.shutdown?.();
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

    it("should start scheduler during ready lifecycle", async () => {
      expect(plugin.getScheduler().isRunning()).toBe(false);

      await plugin.ready();

      expect(plugin.getScheduler().isRunning()).toBe(true);
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

    it("requires publish permission when adding via message bus", async () => {
      const localHarness = createPluginHarness({
        dataDir: "/tmp/test-datadir-permissions",
      });
      localHarness.setPermissionService(
        new PermissionService({
          entityActions: { "social-post": { publish: "anchor" } },
        }),
      );
      const localPlugin = new ContentPipelinePlugin({});
      await localHarness.installPlugin(localPlugin);

      await localHarness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
        entityType: "social-post",
        entityId: "post-1",
        authContext: {
          interfaceType: "test",
          userId: "trusted-user",
          userPermissionLevel: "trusted",
          authorization: "user",
        },
      });

      const queue = await localPlugin.getQueueManager().list("social-post");
      expect(queue.length).toBe(0);
      await localPlugin.shutdown?.();
    });

    it("stores queue add authorization context", async () => {
      await harness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
        entityType: "social-post",
        entityId: "post-1",
        authContext: {
          interfaceType: "test",
          userId: "anchor-user",
          userPermissionLevel: "anchor",
          authorization: "user",
        },
      });

      const queue = await plugin.getQueueManager().list("social-post");
      expect(queue[0]?.authContext).toEqual({
        interfaceType: "test",
        userId: "anchor-user",
        userPermissionLevel: "anchor",
        authorization: "user",
      });
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

    it("forwards direct publish authorization context", async () => {
      const executePayloads: unknown[] = [];
      harness.subscribe(PUBLISH_MESSAGES.EXECUTE, async (msg) => {
        executePayloads.push(msg.payload);
        return { success: true };
      });

      await harness.sendMessage(PUBLISH_MESSAGES.DIRECT, {
        entityType: "social-post",
        entityId: "post-1",
        authContext: {
          interfaceType: "test",
          userId: "anchor-user",
          userPermissionLevel: "anchor",
          authorization: "user",
        },
      });

      expect(executePayloads).toEqual([
        {
          entityType: "social-post",
          entityId: "post-1",
          authContext: {
            interfaceType: "test",
            userId: "anchor-user",
            userPermissionLevel: "anchor",
            authorization: "user",
          },
        },
      ]);
    });

    it("requires publish permission for direct publish messages", async () => {
      const localHarness = createPluginHarness({
        dataDir: "/tmp/test-datadir-direct-permissions",
      });
      localHarness.setPermissionService(
        new PermissionService({
          entityActions: { "social-post": { publish: "anchor" } },
        }),
      );
      const localPlugin = new ContentPipelinePlugin({});
      await localHarness.installPlugin(localPlugin);
      const executePayloads: unknown[] = [];
      localHarness.subscribe(PUBLISH_MESSAGES.EXECUTE, async (msg) => {
        executePayloads.push(msg.payload);
        return { success: true };
      });

      await localHarness.sendMessage(PUBLISH_MESSAGES.DIRECT, {
        entityType: "social-post",
        entityId: "post-1",
        authContext: {
          interfaceType: "test",
          userId: "trusted-user",
          userPermissionLevel: "trusted",
          authorization: "user",
        },
      });

      expect(executePayloads).toEqual([]);
      await localPlugin.shutdown?.();
    });
  });

  describe("queue rebuild on startup", () => {
    it("should rebuild queue from queued entities during ready lifecycle", async () => {
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

      await plugin.ready();

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

      await plugin.ready();

      const queue = await plugin.getQueueManager().list("social-post");
      expect(queue.length).toBe(0);
    });

    it("should handle no queued entities gracefully", async () => {
      await plugin.ready();

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
