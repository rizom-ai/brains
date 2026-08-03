import { describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SkillPlugin } from "../src/plugins/skill-plugin";

describe("Skill projection scheduling boundary", () => {
  it("does not subscribe to topic completion or raw entity events", async () => {
    const harness = createPluginHarness<SkillPlugin>({});
    const enqueue = mock(async () => "job-1");
    const jobQueue = harness.getMockShell().getJobQueueService();
    harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue,
    });
    const capabilities = await harness.installPlugin(new SkillPlugin());

    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );
    await harness.sendMessage(
      "topics:batch-completed",
      { created: 1, merged: 0, skipped: 0, batches: 1 },
      "topics",
    );
    await harness.sendMessage(
      "entity:updated",
      { entityType: "topic", entityId: "topic-1" },
      "entity-service",
    );

    expect(enqueue).not.toHaveBeenCalled();
    expect(capabilities.projectionRules?.[0]?.sources).toEqual([
      { kind: "entity", types: ["topic"] },
      { kind: "entity", types: ["agent"] },
    ]);
  });
});
