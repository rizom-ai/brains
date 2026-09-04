import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  spyOn,
  type Mock,
} from "bun:test";
import { ContentPipelinePlugin } from "../src/plugin";
import {
  PUBLISH_ASSET_MESSAGES,
  PUBLISH_MESSAGES,
} from "../src/types/messages";
import type { PublishProvider } from "@brains/contracts";
import type { DashboardWidgetProviderContext } from "@brains/plugins";
import { PermissionService } from "@brains/templates";
import {
  createPluginHarness,
  type MockShell,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { createMockJobQueueService } from "@brains/test-utils";

// Named off the mock shell rather than imported from @brains/job-queue:
// plugins reach shell packages through @brains/plugins, which does not
// re-export the job queue interface.
type TestJobQueueService = ReturnType<MockShell["getJobQueueService"]>;

function addDraftQueueEntities(
  harness: PluginTestHarness<ContentPipelinePlugin>,
  entityType: string,
  ids: string[],
): void {
  harness.addEntities(
    ids.map((id) => ({
      id,
      entityType,
      content: `---\ntitle: ${id}\nstatus: draft\n---\n\nBody`,
      metadata: { title: id, status: "draft" },
    })),
  );
}

/**
 * A job queue whose enqueue is spied on.
 *
 * The local stub this replaces implemented a dozen members and asserted the
 * literal into place, so it went stale silently as TestJobQueueService changed.
 * The shared factory is a complete, type-checked service; only the one member
 * the test observes is replaced.
 */
function jobQueueWithSpiedEnqueue(): {
  service: TestJobQueueService;
  enqueue: Mock<TestJobQueueService["enqueue"]>;
} {
  const service = createMockJobQueueService();
  const enqueue = spyOn(service, "enqueue").mockResolvedValue("job-1");
  return { service, enqueue };
}

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
    it("should have correct plugin id", () => {
      expect(plugin.id).toBe("content-pipeline");
    });

    it("should initialize components", () => {
      const components = [
        plugin.getQueueManager(),
        plugin.getProviderRegistry(),
        plugin.getRetryTracker(),
        plugin.getScheduler(),
      ];

      // Four separate components, each held rather than rebuilt per call.
      // Asserting only that each is defined would pass for two getters
      // returning the same object, or for a getter constructing a new one
      // every time — the scheduler in particular must be the same instance.
      expect(new Set(components).size).toBe(4);
      expect(plugin.getScheduler()).toBe(plugin.getScheduler());
      expect(plugin.getQueueManager()).toBe(plugin.getQueueManager());
    });

    it("registers only the canonical publishing management tool", () => {
      const toolNames = harness
        .getCapabilities()
        .tools.map((tool) => tool.name);
      expect(toolNames).toContain("publishing_manage");
      expect(toolNames).not.toContain("content-pipeline_queue");
      expect(toolNames).not.toContain("content-pipeline_publish");
      expect(toolNames).not.toContain("content-pipeline_ensure-assets");
    });

    it("should start scheduler during ready lifecycle", async () => {
      expect(plugin.getScheduler().isRunning()).toBe(false);

      await plugin.ready();

      expect(plugin.getScheduler().isRunning()).toBe(true);
    });

    it("keeps the dashboard launch independent from the Studio registration URL", async () => {
      let dashboardDataProvider:
        | ((context: DashboardWidgetProviderContext) => Promise<unknown>)
        | undefined;
      harness.subscribe("studio:register-workspace", async () => ({
        success: true,
        data: { workspaceUrl: "/studio/workspaces/publishing" },
      }));
      harness.subscribe<{
        dataProvider: (
          context: DashboardWidgetProviderContext,
        ) => Promise<unknown>;
      }>("dashboard:register-widget", async (message) => {
        dashboardDataProvider = message.payload.dataProvider;
        return { success: true };
      });

      await plugin.ready();

      const data = await dashboardDataProvider?.({
        caller: {
          actor: { id: "user:admin" },
          permission: "admin",
          isAnchor: true,
        },
        signal: new AbortController().signal,
      });
      expect(data).toMatchObject({
        view: {
          blocks: [
            {},
            {},
            {
              type: "links",
              items: [
                {
                  target: {
                    kind: "launch",
                    launch: { target: "publishing" },
                  },
                },
              ],
            },
          ],
        },
      });
      expect(JSON.stringify(data)).not.toContain(
        "/studio/workspaces/publishing",
      );
    });
  });

  describe("queue operations via message bus", () => {
    it("should add entity to queue", async () => {
      addDraftQueueEntities(harness, "blog-post", ["post-1"]);
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
          entityActions: { "social-post": { publish: "admin" } },
        }),
      );
      const localPlugin = new ContentPipelinePlugin({});
      await localHarness.installPlugin(localPlugin);

      await localHarness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
        entityType: "social-post",
        entityId: "post-1",
        authContext: {
          interfaceType: "test",
          actor: { kind: "user", userId: "trusted-user" },
          userPermissionLevel: "trusted",
          authorization: "user",
        },
      });

      const queue = await localPlugin.getQueueManager().list("social-post");
      expect(queue.length).toBe(0);
      await localPlugin.shutdown?.();
    });

    it("stores queue add authorization context", async () => {
      addDraftQueueEntities(harness, "social-post", ["post-1"]);
      await harness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
        entityType: "social-post",
        entityId: "post-1",
        authContext: {
          interfaceType: "test",
          actor: { kind: "user", userId: "admin-user" },
          userPermissionLevel: "admin",
          authorization: "user",
        },
      });

      const queue = await plugin.getQueueManager().list("social-post");
      expect(queue[0]?.authContext).toEqual({
        interfaceType: "test",
        actor: { kind: "user", userId: "admin-user" },
        userPermissionLevel: "admin",
        authorization: "user",
      });
    });

    it("should remove entity from queue", async () => {
      addDraftQueueEntities(harness, "blog-post", ["post-1"]);
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
      addDraftQueueEntities(harness, "blog-post", ["post-1", "post-2"]);
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

    it("does not emit publish:execute for direct publish without provider", async () => {
      const executePayloads: unknown[] = [];
      harness.subscribe("publish:execute", async (msg) => {
        executePayloads.push(msg.payload);
        return { success: true };
      });

      await harness.sendMessage(PUBLISH_MESSAGES.DIRECT, {
        entityType: "social-post",
        entityId: "post-1",
        authContext: {
          interfaceType: "test",
          actor: { kind: "user", userId: "admin-user" },
          userPermissionLevel: "admin",
          authorization: "user",
        },
      });

      expect(executePayloads).toEqual([]);
    });

    it("uses internal providers through direct provider execution", async () => {
      const publish = mock(async () => ({ id: "email-1" }));
      await harness.sendMessage(PUBLISH_MESSAGES.REGISTER, {
        entityType: "newsletter",
        provider: { name: "internal", publish },
        config: {
          publishResultIdField: "buttondownId",
          publishTimestampField: "sentAt",
        },
      });
      harness.addEntities([
        {
          id: "newsletter-1",
          entityType: "newsletter",
          visibility: "public",
          content: `---
subject: Test Newsletter
status: draft
---
Newsletter body`,
          metadata: { subject: "Test Newsletter", status: "draft" },
        },
      ]);

      await harness.sendMessage(PUBLISH_MESSAGES.DIRECT, {
        entityType: "newsletter",
        entityId: "newsletter-1",
      });

      expect(publish).toHaveBeenCalledWith(
        "Newsletter body",
        expect.objectContaining({ status: "draft" }),
        undefined,
        undefined,
      );
      const updated = await harness.getEntityService().getEntity({
        entityType: "newsletter",
        id: "newsletter-1",
      });
      expect(updated?.metadata["status"]).toBe("published");
      expect(updated?.metadata["buttondownId"]).toBe("email-1");
      expect(typeof updated?.metadata["sentAt"]).toBe("string");
      expect(updated?.content).toContain("sentAt:");
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
      harness.subscribe("publish:execute", async (msg) => {
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
      const { service: jobQueue, enqueue } = jobQueueWithSpiedEnqueue();
      localHarness.getMockShell().getJobQueueService =
        (): TestJobQueueService => jobQueue;
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
          entityActions: { "social-post": { publish: "admin" } },
        }),
      );
      const localPlugin = new ContentPipelinePlugin({});
      await localHarness.installPlugin(localPlugin);
      const executePayloads: unknown[] = [];
      localHarness.subscribe("publish:execute", async (msg) => {
        executePayloads.push(msg.payload);
        return { success: true };
      });

      await localHarness.sendMessage(PUBLISH_MESSAGES.DIRECT, {
        entityType: "social-post",
        entityId: "post-1",
        authContext: {
          interfaceType: "test",
          actor: { kind: "user", userId: "trusted-user" },
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
      await harness.sendMessage(PUBLISH_MESSAGES.REGISTER, {
        entityType: "social-post",
        provider: {
          name: "linkedin",
          publish: async () => ({ id: "remote-post" }),
        },
      });

      await plugin.ready();

      const queue = await plugin.getQueueManager().list("social-post");
      expect(queue.length).toBe(2);
      const queuedIds = queue.map((e) => e.entityId);
      expect(queuedIds).toContain("post-1");
      expect(queuedIds).toContain("post-2");
    });

    it("ignores queued status on types without a publish provider", async () => {
      harness.addEntities([
        {
          id: "social-post",
          entityType: "social-post",
          content: "queued social post",
          metadata: { status: "queued", title: "Social post" },
        },
        {
          id: "workflow-card",
          entityType: "workflow-card",
          content: "queued workflow card",
          metadata: { status: "queued", title: "Workflow card" },
        },
      ]);
      await harness.sendMessage(PUBLISH_MESSAGES.REGISTER, {
        entityType: "social-post",
        provider: {
          name: "linkedin",
          publish: async () => ({ id: "remote-post" }),
        },
      });

      await plugin.ready();

      expect(await plugin.getQueueManager().list("social-post")).toHaveLength(
        1,
      );
      expect(await plugin.getQueueManager().list("workflow-card")).toHaveLength(
        0,
      );
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
      const { service: jobQueue, enqueue } = jobQueueWithSpiedEnqueue();
      localHarness.getMockShell().getJobQueueService =
        (): TestJobQueueService => jobQueue;
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
      });

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
