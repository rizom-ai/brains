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

describe("Initial sync triggers batch deriveAll", () => {
  it("should queue deriveAll after sync:initial:completed", async () => {
    const { harness, plugin, enqueue, registerHandler } = installWithJobQueue();

    await harness.installPlugin(plugin);

    expect(plugin.hasRunInitialDerivation()).toBe(false);

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(plugin.hasRunInitialDerivation()).toBe(true);
    expect(plugin.isAutoExtractionEnabled()).toBe(true);
    expect(registerHandler).toHaveBeenCalledWith(
      "topics:extract",
      expect.any(Object),
      "topics",
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      "topics:extract",
      { mode: "derive" },
      expect.objectContaining({
        deduplication: "coalesce",
        deduplicationKey: "topics-initial-derivation",
      }),
    );

    harness.reset();
  });

  it("should not run deriveAll when auto-extraction is disabled", async () => {
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

  it("should only queue deriveAll once across multiple sync events", async () => {
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

    // Flag is only set after work is enqueued — when persisted topics
    // already exist we skip the enqueue, so the flag stays false and a
    // future sync can still trigger derivation if topics are deleted.
    expect(plugin.hasRunInitialDerivation()).toBe(false);
    expect(plugin.isAutoExtractionEnabled()).toBe(true);
    expect(enqueue).not.toHaveBeenCalled();

    harness.reset();
  });
});
