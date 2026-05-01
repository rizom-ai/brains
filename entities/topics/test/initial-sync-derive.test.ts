import { describe, it, expect, mock } from "bun:test";
import { TopicsPlugin } from "../src";
import { createPluginHarness } from "@brains/plugins/test";

function installWithJobQueue(): {
  harness: ReturnType<typeof createPluginHarness<TopicsPlugin>>;
  plugin: TopicsPlugin;
  enqueue: ReturnType<typeof mock>;
  registerHandler: ReturnType<typeof mock>;
} {
  const harness = createPluginHarness<TopicsPlugin>({});
  const enqueue = mock(async () => "job-1");
  const registerHandler = mock(() => {});

  harness.getMockShell().getJobQueueService = (): never =>
    ({
      enqueue,
      registerHandler,
      getActiveJobs: async () => [],
      getActiveBatches: async () => [],
      getBatchStatus: async () => null,
      getStatus: async () => null,
    }) as never;

  const plugin = new TopicsPlugin({
    enableAutoExtraction: true,
    includeEntityTypes: ["post"],
  });
  return { harness, plugin, enqueue, registerHandler };
}

describe("Initial sync triggers batch projection", () => {
  it("should queue projection after sync:initial:completed", async () => {
    const { harness, plugin, enqueue, registerHandler } = installWithJobQueue();

    await harness.installPlugin(plugin);

    expect(plugin.hasRunInitialDerivation()).toBe(false);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(plugin.hasRunInitialDerivation()).toBe(true);
    expect(registerHandler).toHaveBeenCalledWith(
      "topic:project",
      expect.any(Object),
      "topics",
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      "topic:project",
      { mode: "derive", reason: "initial-sync" },
      expect.objectContaining({
        deduplication: "coalesce",
        deduplicationKey: "topics-initial-derivation",
      }),
    );

    harness.reset();
  });

  it("should not queue projection when auto-extraction is disabled", async () => {
    const harness = createPluginHarness<TopicsPlugin>({});
    const plugin = new TopicsPlugin({ enableAutoExtraction: false });

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(plugin.hasRunInitialDerivation()).toBe(false);

    harness.reset();
  });

  it("should only queue projection once across multiple sync events", async () => {
    const { harness, plugin, enqueue } = installWithJobQueue();

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(plugin.hasRunInitialDerivation()).toBe(true);

    // Second sync should not re-trigger (flag stays true, no error)
    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(plugin.hasRunInitialDerivation()).toBe(true);
    expect(enqueue).toHaveBeenCalledTimes(1);

    harness.reset();
  });

  it("should queue source projection after initial sync", async () => {
    const { harness, plugin, enqueue } = installWithJobQueue();

    await harness.installPlugin(plugin);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(enqueue).toHaveBeenCalledTimes(1);

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

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenLastCalledWith(
      "topic:project",
      {
        mode: "source",
        entityId: "post-1",
        entityType: "post",
        contentHash: "hash-1",
        minRelevanceScore: expect.any(Number),
        autoMerge: expect.any(Boolean),
        mergeSimilarityThreshold: expect.any(Number),
      },
      expect.objectContaining({
        deduplication: "coalesce",
        deduplicationKey: "topics-source:post:post-1:hash-1",
      }),
    );

    harness.reset();
  });

  it("should not queue initial extraction when persisted topics already exist", async () => {
    const { harness, plugin, enqueue } = installWithJobQueue();

    await harness.installPlugin(plugin);
    harness.addEntities([
      {
        id: "existing-topic",
        entityType: "topic",
        content: "---\ntitle: Existing Topic\n---\nExisting topic",
        metadata: { title: "Existing Topic" },
      },
    ]);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    // Initial derivation is only marked after work is enqueued. Persisted
    // topics skip the initial job while still allowing source-change jobs
    // after the initial sync event has been observed.
    expect(plugin.hasRunInitialDerivation()).toBe(false);
    expect(enqueue).not.toHaveBeenCalled();

    harness.reset();
  });
});
