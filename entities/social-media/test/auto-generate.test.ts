import { describe, expect, it, mock } from "bun:test";
import type { PluginCapabilities } from "@brains/plugins";
import {
  baseEntitySchema,
  createPluginHarness,
  createTestEntityAdapter,
  refuseEnqueues,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { waitUntil } from "@brains/test-utils";
import { SocialMediaPlugin } from "../src/plugin";

async function install(config: {
  autoGenerateOnBlogPublish: boolean;
}): Promise<{
  capabilities: PluginCapabilities;
  enqueue: ReturnType<typeof mock>;
  harness: PluginTestHarness<SocialMediaPlugin>;
}> {
  const harness = createPluginHarness<SocialMediaPlugin>({
    dataDir: `/tmp/test-social-media-${String(config.autoGenerateOnBlogPublish)}`,
  });
  const enqueue = mock(async () => "job-1");
  const jobQueue = harness.getMockShell().getJobQueueService();
  harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
    ...jobQueue,
    enqueue,
  });
  const capabilities = await harness.installPlugin(
    new SocialMediaPlugin(config),
  );
  return { capabilities, enqueue, harness };
}

describe("SocialMediaPlugin projection scheduling boundary", () => {
  it("does not register a projection rule when auto generation is disabled", async () => {
    const { capabilities } = await install({
      autoGenerateOnBlogPublish: false,
    });

    expect(capabilities.projectionRules).toBeUndefined();
    expect("projections" in capabilities).toBe(false);
  });

  it("registers one scheduler-owned rule and no event-driven auto-generation", async () => {
    const { capabilities, enqueue, harness } = await install({
      autoGenerateOnBlogPublish: true,
    });

    expect("projections" in capabilities).toBe(false);
    expect(capabilities.projectionRules).toHaveLength(1);
    expect(capabilities.projectionRules?.[0]).toMatchObject({
      id: "social-post-generation",
      sources: [{ kind: "entity", types: ["post"] }],
      targetType: "social-post",
    });

    await harness.sendMessage("entity:updated", {
      entityType: "post",
      entityId: "post-1",
      entity: { metadata: { status: "queued" } },
    });
    await harness.sendMessage("social:auto-generate", {
      sourceEntityType: "post",
      sourceEntityId: "post-1",
      platform: "linkedin",
    });

    expect(enqueue).not.toHaveBeenCalled();
  });
});

describe("SocialMediaPlugin scheduled generation", () => {
  it("queues a scheduled generation the queue refused once it admits it", async () => {
    const harness = createPluginHarness<SocialMediaPlugin>({
      dataDir: "/tmp/test-social-media-refused-generation",
    });
    harness
      .getEntityRegistry()
      .registerEntityType(
        "post",
        baseEntitySchema,
        createTestEntityAdapter("post"),
      );
    await harness.getEntityService().createEntity({
      entity: {
        id: "post-1",
        entityType: "post",
        content: "A post",
        visibility: "public",
        metadata: { status: "published" },
      },
    });
    const shell = harness.getMockShell();
    const queue = shell.getJobQueueService();
    const refusals = refuseEnqueues(queue, 1);
    await harness.installPlugin(new SocialMediaPlugin({}));

    await harness.sendMessage("generate:execute", {
      entityType: "social-post",
    });
    expect(refusals.count).toBe(1);

    await waitUntil(
      async () =>
        (await queue.getActiveJobs()).some((job) =>
          job.type.endsWith("social-post:generation"),
        ),
      "the refused generation to be queued",
      { timeoutMs: 5_000 },
    );
    await harness.reset();
  });
});
