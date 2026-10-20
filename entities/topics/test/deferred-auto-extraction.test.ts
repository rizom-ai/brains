import { describe, expect, it, mock } from "bun:test";
import { SYSTEM_CHANNELS, type PluginCapabilities } from "@brains/plugins";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import { TopicsPlugin } from "../src";

type Queue = ReturnType<
  ReturnType<
    PluginTestHarness<TopicsPlugin>["getMockShell"]
  >["getJobQueueService"]
>;

async function install(
  enabled = true,
  executionOnly = false,
): Promise<{
  harness: PluginTestHarness<TopicsPlugin>;
  capabilities: PluginCapabilities;
  enqueue: ReturnType<typeof mock<Queue["enqueue"]>>;
  registerHandler: ReturnType<typeof mock<Queue["registerHandler"]>>;
}> {
  const harness = createPluginHarness<TopicsPlugin>({
    logContext: "topics-test",
  });
  const queue = harness.getMockShell().getJobQueueService();
  const enqueue = mock(queue.enqueue);
  const registerHandler = mock(queue.registerHandler);
  harness.getMockShell().getJobQueueService = (): Queue => ({
    ...queue,
    enqueue,
    registerHandler,
  });
  const plugin = new TopicsPlugin({
    enableAutoExtraction: enabled,
    includeEntityTypes: ["post"],
  });
  const capabilities = executionOnly
    ? await plugin.register(harness.getMockShell(), { executionOnly: true })
    : await harness.installPlugin(plugin);
  return { harness, capabilities, enqueue, registerHandler };
}

describe("ranked topic extraction triggers", () => {
  it.each([false, true])(
    "enqueues a deduplicated successor for eligible entity events (worker=%s)",
    async (worker) => {
      const { harness, enqueue, capabilities, registerHandler } = await install(
        true,
        worker,
      );
      expect(capabilities.projectionRules).toBeUndefined();
      expect(registerHandler).toHaveBeenCalledWith(
        "topics:extract",
        expect.anything(),
        "topics",
      );
      for (const type of [
        "entity:created",
        "entity:updated",
        "entity:deleted",
      ]) {
        await harness.sendMessage(
          type,
          { entityType: "post", entityId: "post-1" },
          "entity-service",
        );
      }
      expect(enqueue).toHaveBeenCalledTimes(3);
      for (const [request] of enqueue.mock.calls) {
        expect(request).toMatchObject({
          type: "topics:extract",
          options: {
            deduplication: "skip",
            deduplicationKey: "topics:extract",
            rootJobId: expect.any(String),
          },
        });
      }
      await harness.sendMessage(
        "entity:created",
        { entityType: "topic", entityId: "topic-1" },
        "entity-service",
      );
      await harness.sendMessage(
        "entity:updated",
        { entityType: "note", entityId: "note-1" },
        "entity-service",
      );
      expect(enqueue).toHaveBeenCalledTimes(3);
    },
  );

  it("heals stale votes on startup-content-settled, not the legacy sync signal", async () => {
    const { harness, enqueue } = await install();
    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    expect(enqueue).not.toHaveBeenCalled();
    await harness.sendMessage(
      SYSTEM_CHANNELS.startupContentSettled,
      {},
      "shell",
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
  });

  it("registers no extraction handler or subscriptions when disabled", async () => {
    const { harness, enqueue, registerHandler } = await install(false);
    await harness.sendMessage(
      "entity:updated",
      { entityType: "post" },
      "entity-service",
    );
    await harness.sendMessage(
      SYSTEM_CHANNELS.startupContentSettled,
      {},
      "shell",
    );
    expect(registerHandler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
