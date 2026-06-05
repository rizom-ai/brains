import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import { ContentPipelinePlugin } from "../src/plugin";
import {
  PUBLISH_ASSET_MESSAGES,
  PUBLISH_MESSAGES,
} from "../src/types/messages";
import type { PublishProvider } from "@brains/contracts";
import { PermissionService } from "@brains/templates";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";

const createMockJobQueueService = (
  enqueue: (job: unknown) => Promise<string>,
): never =>
  ({
    enqueue,
    complete: async () => {},
    fail: async () => {},
    getStatus: async () => null,
    getStats: async () => ({
      pending: 0,
      processing: 0,
      failed: 0,
      completed: 0,
      total: 0,
    }),
    cleanup: async () => 0,
    registerHandler: () => {},
    unregisterHandler: () => {},
    unregisterPluginHandlers: () => {},
    getRegisteredTypes: () => [],
    getHandler: () => undefined,
    update: async () => {},
    getActiveJobs: async () => [],
    getStatusByEntityId: async () => null,
  }) as never;

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

    it("keeps internal message-mode providers on publish:execute fallback", async () => {
      await harness.sendMessage(PUBLISH_MESSAGES.REGISTER, {
        entityType: "newsletter",
        provider: {
          name: "internal",
          publish: async () => ({ id: "internal" }),
        },
      });
      const executePayloads: unknown[] = [];
      harness.subscribe(PUBLISH_MESSAGES.EXECUTE, async (msg) => {
        executePayloads.push(msg.payload);
        return { success: true };
      });

      await harness.sendMessage(PUBLISH_MESSAGES.DIRECT, {
        entityType: "newsletter",
        entityId: "newsletter-1",
      });

      expect(executePayloads).toEqual([
        expect.objectContaining({
          entityType: "newsletter",
          entityId: "newsletter-1",
        }),
      ]);
    });

    it("uses registered provider for direct publish messages", async () => {
      const publish = mock(async () => ({ id: "platform-post-1" }));
      await harness.sendMessage(PUBLISH_MESSAGES.REGISTER, {
        entityType: "post",
        provider: { name: "test-provider", publish },
      });
      harness.addEntities([
        {
          id: "post-1",
          entityType: "post",
          visibility: "public",
          content: `---
title: Test Post
status: draft
---
Post body`,
          metadata: { status: "draft", slug: "post-1" },
        },
      ]);
      const executePayloads: unknown[] = [];
      harness.subscribe(PUBLISH_MESSAGES.EXECUTE, async (msg) => {
        executePayloads.push(msg.payload);
        return { success: true };
      });

      await harness.sendMessage(PUBLISH_MESSAGES.DIRECT, {
        entityType: "post",
        entityId: "post-1",
      });

      expect(executePayloads).toEqual([]);
      expect(publish).toHaveBeenCalledWith(
        "Post body",
        expect.objectContaining({ status: "draft" }),
        undefined,
        undefined,
      );
      const updated = await harness.getEntityService().getEntity({
        entityType: "post",
        id: "post-1",
      });
      expect(updated?.metadata["status"]).toBe("published");
      expect(updated?.content).toContain("status: published");
    });

    it("queues missing publish assets after provider-mode direct publish", async () => {
      const localHarness = createPluginHarness({
        dataDir: "/tmp/test-datadir-direct-publish-assets",
      });
      const enqueue = mock(async () => "job-1");
      localHarness.getMockShell().getJobQueueService = (): never =>
        createMockJobQueueService(enqueue);
      const localPlugin = new ContentPipelinePlugin({});
      await localHarness.installPlugin(localPlugin);
      localHarness
        .getMockShell()
        .getAttachmentRegistry()
        .register("post", "og-image", {
          resolve: () => undefined,
        });
      await localHarness.sendMessage(PUBLISH_ASSET_MESSAGES.REGISTER, {
        entityType: "post",
        attachmentType: "og-image",
        mediaEntityType: "image",
        targetEntityField: { location: "frontmatter", field: "ogImageId" },
        requiredWhen: { status: "published" },
        autoGenerate: true,
        jobType: "image:image-render-source",
      });
      await localHarness.sendMessage(PUBLISH_MESSAGES.REGISTER, {
        entityType: "post",
        provider: {
          name: "test-provider",
          publish: async () => ({ id: "p1" }),
        },
      });
      localHarness.addEntities([
        {
          id: "post-1",
          entityType: "post",
          visibility: "public",
          content: `---
title: Test Post
status: draft
---
Post body`,
          metadata: { status: "draft", slug: "post-1" },
        },
      ]);

      await localHarness.sendMessage(PUBLISH_MESSAGES.DIRECT, {
        entityType: "post",
        entityId: "post-1",
      });

      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "image:image-render-source",
          data: expect.objectContaining({
            sourceEntityType: "post",
            sourceEntityId: "post-1",
            targetImageField: "ogImageId",
          }),
          options: expect.objectContaining({
            deduplication: "skip",
          }),
        }),
      );
      await localPlugin.shutdown?.();
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

  describe("publish asset registration", () => {
    it("registers publish assets via message bus", async () => {
      await harness.sendMessage(PUBLISH_ASSET_MESSAGES.REGISTER, {
        entityType: "post",
        attachmentType: "og-image",
        mediaEntityType: "image",
        targetEntityField: { location: "frontmatter", field: "ogImageId" },
        requiredWhen: { status: "published" },
        autoGenerate: true,
        jobType: "image:image-render-source",
      });

      expect(
        plugin.getPublishAssetRegistry().get("post", "og-image"),
      ).toMatchObject({
        entityType: "post",
        attachmentType: "og-image",
        mediaEntityType: "image",
      });
    });

    it("runs publish asset preflight for published entity changes", async () => {
      const localHarness = createPluginHarness({
        dataDir: "/tmp/test-datadir-publish-asset-events",
      });
      const enqueue = mock(async () => "job-1");
      localHarness.getMockShell().getJobQueueService = (): never =>
        createMockJobQueueService(enqueue);
      const localPlugin = new ContentPipelinePlugin({});
      await localHarness.installPlugin(localPlugin);
      localHarness
        .getMockShell()
        .getAttachmentRegistry()
        .register("post", "og-image", {
          resolve: () => undefined,
        });
      await localHarness.sendMessage(PUBLISH_ASSET_MESSAGES.REGISTER, {
        entityType: "post",
        attachmentType: "og-image",
        mediaEntityType: "image",
        targetEntityField: { location: "frontmatter", field: "ogImageId" },
        requiredWhen: { status: "published" },
        autoGenerate: true,
        jobType: "image:image-render-source",
      });

      await localHarness.sendMessage("entity:updated", {
        entityType: "post",
        entityId: "post-1",
        entity: {
          id: "post-1",
          entityType: "post",
          visibility: "public",
          content: `---
title: Test Post
status: published
---
Body`,
          metadata: { status: "published", slug: "post-1" },
          created: "2026-06-04T12:00:00.000Z",
          updated: "2026-06-04T12:00:00.000Z",
          contentHash: "hash",
        },
      });

      expect(enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "image:image-render-source",
        }),
      );
      await localPlugin.shutdown?.();
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

    it("rejects invalid provider config", async () => {
      const provider: PublishProvider = {
        name: "test-provider",
        publish: async () => ({ id: "result" }),
      };

      await harness.sendMessage(PUBLISH_MESSAGES.REGISTER, {
        entityType: "blog-post",
        provider,
        config: { executionMode: "invalid" },
      } as never);

      expect(plugin.getProviderRegistry().has("blog-post")).toBe(false);
    });

    it("should not let internal fallback registration override an explicit provider", async () => {
      const explicitProvider: PublishProvider = {
        name: "atproto",
        publish: async () => ({ id: "atproto-result" }),
      };
      const internalProvider: PublishProvider = {
        name: "internal",
        publish: async () => ({ id: "internal-result" }),
      };

      await harness.sendMessage(PUBLISH_MESSAGES.REGISTER, {
        entityType: "post",
        provider: explicitProvider,
      });
      await harness.sendMessage(PUBLISH_MESSAGES.REGISTER, {
        entityType: "post",
        provider: internalProvider,
      });

      expect(plugin.getProviderRegistry().get("post")).toBe(explicitProvider);
    });
  });
});
