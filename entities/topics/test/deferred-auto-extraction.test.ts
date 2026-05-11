import { describe, it, expect, mock } from "bun:test";
import { TopicsPlugin } from "../src";
import { createPluginHarness } from "@brains/plugins/test";

function installWithJobQueue(
  config: ConstructorParameters<typeof TopicsPlugin>[0],
): {
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

  const plugin = new TopicsPlugin(config);
  return { harness, plugin, enqueue, registerHandler };
}

async function sendPostUpdate(
  harness: ReturnType<typeof createPluginHarness<TopicsPlugin>>,
): Promise<void> {
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

describe("Deferred Auto-Extraction", () => {
  it("does not queue source projections before initial sync completes", async () => {
    const { harness, plugin, enqueue } = installWithJobQueue({
      enableAutoExtraction: true,
      includeEntityTypes: ["post"],
    });

    await harness.installPlugin(plugin);
    await sendPostUpdate(harness);

    expect(enqueue).not.toHaveBeenCalled();

    harness.reset();
  });

  it("queues source projections after initial sync when auto-extraction is enabled", async () => {
    const { harness, plugin, enqueue } = installWithJobQueue({
      enableAutoExtraction: true,
      includeEntityTypes: ["post"],
    });

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
    await sendPostUpdate(harness);

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith({
      type: "topic:project",
      data: expect.objectContaining({
        mode: "source-batch",
      }),
      options: expect.objectContaining({
        deduplication: "skip",
        deduplicationKey: "topics-source-batch",
      }),
    });

    harness.reset();
  });

  it("stores one batch source job for a burst of source changes", async () => {
    const { harness, plugin, enqueue } = installWithJobQueue({
      enableAutoExtraction: true,
      includeEntityTypes: ["post"],
    });
    const storedJobs = new Map<string, unknown>();
    enqueue.mockImplementation(async (request) => {
      const key = request.options?.deduplicationKey ?? request.type;
      if (request.options?.deduplication === "skip" && storedJobs.has(key)) {
        return `job-${key}`;
      }
      storedJobs.set(key, request);
      return `job-${key}`;
    });

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
    await sendPostUpdate(harness);
    await harness.sendMessage(
      "entity:updated",
      {
        entityType: "post",
        entityId: "post-2",
        entity: {
          id: "post-2",
          entityType: "post",
          content: "Another published post",
          metadata: { status: "published" },
          contentHash: "hash-2",
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        },
      },
      "entity-service",
    );

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(storedJobs.size).toBe(1);
    expect(storedJobs.get("topics-source-batch")).toMatchObject({
      type: "topic:project",
      data: { mode: "source-batch" },
      options: {
        deduplication: "skip",
        deduplicationKey: "topics-source-batch",
      },
    });
    for (const call of enqueue.mock.calls) {
      expect(call[0]).toMatchObject({
        type: "topic:project",
        data: { mode: "source-batch" },
        options: {
          deduplication: "skip",
          deduplicationKey: "topics-source-batch",
        },
      });
    }

    harness.reset();
  });

  it("does not register projection behavior when auto-extraction is disabled", async () => {
    const { harness, plugin, enqueue, registerHandler } = installWithJobQueue({
      enableAutoExtraction: false,
      includeEntityTypes: ["post"],
    });

    await harness.installPlugin(plugin);
    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    await sendPostUpdate(harness);

    expect(registerHandler).not.toHaveBeenCalledWith(
      "topic:project",
      expect.any(Object),
      "topics",
    );
    expect(enqueue).not.toHaveBeenCalled();

    harness.reset();
  });
});
