import { describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins";
import { skillPlugins } from "./agent-discovery-plugins";

describe("Skill projection scheduling boundary", () => {
  it("does not subscribe to sync completion or raw entity events", async () => {
    const harness = createPluginHarness({});
    const enqueue = mock(async () => "job-1");
    const jobQueue = harness.getMockShell().getJobQueueService();
    harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue,
    });
    const capabilities: PluginCapabilities[] = [];
    for (const plugin of skillPlugins())
      capabilities.push(await harness.installPlugin(plugin));

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    await harness.sendMessage(
      "entity:updated",
      { entityType: "topic", entityId: "topic-1" },
      "entity-service",
    );

    expect(enqueue).not.toHaveBeenCalled();
    expect(
      capabilities.flatMap(({ projectionRules }) => projectionRules ?? [])[0]
        ?.sources,
    ).toEqual([
      { kind: "entity", types: ["topic"] },
      { kind: "entity", types: ["agent"] },
    ]);
  });
});
