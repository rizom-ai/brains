import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { ContentPipelinePlugin } from "../src/plugin";
import { PUBLISH_MESSAGES } from "../src/types/messages";

describe("ContentPipelinePlugin queue storage integration", () => {
  let harness: PluginTestHarness<ContentPipelinePlugin>;
  let plugin: ContentPipelinePlugin;

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
    await plugin.shutdown?.();
  });

  it("routes message mutations through durable queue storage", async () => {
    await harness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
      entityType: "social-post",
      entityId: "post-1",
      authContext: {
        interfaceType: "cms",
        userId: "operator",
        userPermissionLevel: "anchor",
        authorization: "user" as const,
      },
    });
    await harness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
      entityType: "social-post",
      entityId: "post-2",
    });
    await harness.sendMessage(PUBLISH_MESSAGES.REORDER, {
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

    await harness.sendMessage(PUBLISH_MESSAGES.REMOVE, {
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
    await harness.sendMessage(PUBLISH_MESSAGES.QUEUE, {
      entityType: "social-post",
      entityId: "post-1",
    });

    await harness.sendMessage(PUBLISH_MESSAGES.FAILED, {
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

  it("routes the queue tool through the same storage boundary", async () => {
    const result = await harness.executeTool(
      "content-pipeline_queue",
      {
        action: "add",
        entityType: "social-post",
        entityId: "post-1",
      },
      {
        interfaceType: "cms",
        userId: "operator",
        userPermissionLevel: "anchor",
      },
    );

    expect("success" in result && result.success).toBe(true);
    expect(
      await plugin.getPublicationQueueService().listStored("social-post"),
    ).toEqual([
      expect.objectContaining({
        entityId: "post-1",
        authContext: expect.objectContaining({
          interfaceType: "cms",
          userId: "operator",
          authorization: "user",
        }),
      }),
    ]);
  });
});
