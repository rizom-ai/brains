import { describe, expect, it, mock } from "bun:test";
import type { PluginCapabilities } from "@brains/plugins";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { TopicsPlugin } from "../src";

async function install(
  config: ConstructorParameters<typeof TopicsPlugin>[0],
): Promise<{
  capabilities: PluginCapabilities;
  enqueue: ReturnType<typeof mock>;
  harness: PluginTestHarness<TopicsPlugin>;
}> {
  const harness = createPluginHarness<TopicsPlugin>({});
  const enqueue = mock(async () => "job-1");
  const jobQueue = harness.getMockShell().getJobQueueService();
  harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
    ...jobQueue,
    enqueue,
  });
  const capabilities = await harness.installPlugin(new TopicsPlugin(config));
  return { capabilities, enqueue, harness };
}

async function sendLegacyTriggers(
  harness: ReturnType<typeof createPluginHarness<TopicsPlugin>>,
): Promise<void> {
  await harness.sendMessage(
    "sync:initial:completed",
    { success: true },
    "directory-sync",
  );
  await harness.sendMessage(
    "entity:updated",
    {
      entityType: "post",
      entityId: "post-1",
      entity: {
        id: "post-1",
        entityType: "post",
        content: "Published post",
        metadata: { status: "published" },
        contentHash: "hash-1",
        created: new Date().toISOString(),
        updated: new Date().toISOString(),
      },
    },
    "entity-service",
  );
}

describe("Topics projection scheduling boundary", () => {
  it("uses one scheduler rule instead of initial-sync or entity event jobs", async () => {
    const { capabilities, enqueue, harness } = await install({
      enableAutoExtraction: true,
      includeEntityTypes: ["post"],
    });

    await sendLegacyTriggers(harness);

    expect(enqueue).not.toHaveBeenCalled();
    expect(capabilities.projectionRules).toHaveLength(1);
    expect(capabilities.projectionRules?.[0]).toMatchObject({
      id: "topics-projection",
      sources: [{ kind: "entity", types: ["post"] }],
      targetType: "topic",
    });
  });

  it("registers no projection behavior when auto extraction is disabled", async () => {
    const { capabilities, enqueue, harness } = await install({
      enableAutoExtraction: false,
      includeEntityTypes: ["post"],
    });

    await sendLegacyTriggers(harness);

    expect(enqueue).not.toHaveBeenCalled();
    expect(capabilities.projectionRules).toBeUndefined();
    expect("projections" in capabilities).toBe(false);
  });
});
