import { describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { TopicsPlugin } from "../src";

describe("Topic projection registration", () => {
  it("registers one scheduler rule and no event-driven projection job", async () => {
    const harness = createPluginHarness<TopicsPlugin>({});
    const enqueue = mock(async () => "job-1");
    const registerHandler = mock(() => {});
    const jobQueue = harness.getMockShell().getJobQueueService();
    harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue,
      registerHandler,
    });
    const plugin = new TopicsPlugin({
      enableAutoExtraction: true,
      includeEntityTypes: ["post"],
    });

    const capabilities = await harness.installPlugin(plugin);
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

    expect("projections" in capabilities).toBe(false);
    expect(capabilities.projectionRules).toHaveLength(1);
    expect(capabilities.projectionRules?.[0]?.sources).toEqual([
      { kind: "entity", types: ["post"], excludeTypes: ["topic"] },
    ]);
    expect(registerHandler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("registers no projection rule when auto extraction is disabled", async () => {
    const harness = createPluginHarness<TopicsPlugin>({});
    const capabilities = await harness.installPlugin(
      new TopicsPlugin({ enableAutoExtraction: false }),
    );

    expect("projections" in capabilities).toBe(false);
    expect(capabilities.projectionRules).toBeUndefined();
  });
});
