import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { PUBLISH_CHANNELS } from "@brains/contracts";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { ContentPipelinePlugin } from "../src/plugin";

describe("ContentPipelinePlugin queue storage integration", () => {
  let harness: PluginTestHarness<ContentPipelinePlugin>;
  let plugin: ContentPipelinePlugin;

  async function manage(input: Record<string, unknown>): Promise<void> {
    const result = await harness.executeTool("publishing_manage", input, {
      interfaceType: "studio",
      actor: { kind: "user", userId: "operator" },
      userPermissionLevel: "admin",
    });
    expect("success" in result && result.success).toBe(true);
  }

  beforeEach(async () => {
    harness = createPluginHarness({
      dataDir: "/tmp/content-pipeline-queue-storage-test",
    });
    plugin = new ContentPipelinePlugin({});
    await harness.installPlugin(plugin);
    harness.addEntities([
      {
        id: "post-1",
        entityType: "social-post",
        content: "---\ntitle: Post 1\nstatus: draft\n---\n\nBody",
        metadata: { title: "Post 1", status: "draft" },
      },
      {
        id: "post-2",
        entityType: "social-post",
        content: "---\ntitle: Post 2\nstatus: draft\n---\n\nBody",
        metadata: { title: "Post 2", status: "draft" },
      },
    ]);
  });

  afterEach(async () => {
    await plugin.shutdown();
  });

  it("routes queue mutations through durable queue storage", async () => {
    await manage({
      action: "queue-add",
      entityType: "social-post",
      entityId: "post-1",
    });
    await manage({
      action: "queue-add",
      entityType: "social-post",
      entityId: "post-2",
    });
    await manage({
      action: "queue-reorder",
      entityType: "social-post",
      entityId: "post-2",
      position: 1,
    });

    expect(
      (await plugin.getQueueManager().list("social-post")).map(
        (entry) => entry.entityId,
      ),
    ).toEqual(["post-2", "post-1"]);
    expect(
      (await plugin.getPublicationQueueService().listStored("social-post")).map(
        (entry) => entry.entityId,
      ),
    ).toEqual(["post-2", "post-1"]);
    expect(
      (
        await harness.getEntityService().getEntity({
          entityType: "social-post",
          id: "post-1",
        })
      )?.metadata["status"],
    ).toBe("queued");

    await manage({
      action: "queue-remove",
      entityType: "social-post",
      entityId: "post-1",
    });

    expect(
      (await plugin.getPublicationQueueService().listStored("social-post")).map(
        (entry) => entry.entityId,
      ),
    ).toEqual(["post-2"]);
    expect(
      (
        await harness.getEntityService().getEntity({
          entityType: "social-post",
          id: "post-1",
        })
      )?.metadata["status"],
    ).toBe("draft");
  });

  it("persists terminal failures and clears recoverable queue order", async () => {
    await manage({
      action: "queue-add",
      entityType: "social-post",
      entityId: "post-1",
    });

    await harness.sendMessage(PUBLISH_CHANNELS.failed, {
      entityType: "social-post",
      entityId: "post-1",
      error: "Provider unavailable",
      retryCount: 1,
      willRetry: false,
    });

    expect(
      await plugin.getPublicationQueueService().listStored("social-post"),
    ).toEqual([]);
    expect(
      (
        await harness.getEntityService().getEntity({
          entityType: "social-post",
          id: "post-1",
        })
      )?.metadata,
    ).toMatchObject({ status: "failed", error: "Provider unavailable" });
  });

  it.each([
    [
      PUBLISH_CHANNELS.failed,
      { entityType: "social-post", entityId: "post-1" },
    ],
    [
      PUBLISH_CHANNELS.completed,
      { entityType: "social-post", entityId: "post-1" },
    ],
  ])("refuses a malformed %s and keeps the queue", async (channel, payload) => {
    await manage({
      action: "queue-add",
      entityType: "social-post",
      entityId: "post-1",
    });

    await harness.sendMessage(channel, payload, "test", true);

    expect(
      (await plugin.getPublicationQueueService().listStored("social-post")).map(
        (entry) => entry.entityId,
      ),
    ).toEqual(["post-1"]);
    expect(
      (
        await harness.getEntityService().getEntity({
          entityType: "social-post",
          id: "post-1",
        })
      )?.metadata["status"],
    ).toBe("queued");
  });

  it("routes publishing_manage queue-add through the same storage boundary", async () => {
    await manage({
      action: "queue-add",
      entityType: "social-post",
      entityId: "post-1",
    });

    expect(
      await plugin.getPublicationQueueService().listStored("social-post"),
    ).toEqual([
      expect.objectContaining({
        entityId: "post-1",
        authContext: expect.objectContaining({
          interfaceType: "studio",
          actor: { kind: "user", userId: "operator" },
          authorization: "user",
        }),
      }),
    ]);
  });
});
