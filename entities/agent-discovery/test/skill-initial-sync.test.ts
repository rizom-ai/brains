import { describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import { SkillPlugin } from "../src/plugins/skill-plugin";
import { SKILL_ENTITY_TYPE } from "../src/lib/constants";

describe("Skill projection registration", () => {
  it("registers skill as a projection output", async () => {
    const harness = createPluginHarness<SkillPlugin>({});
    await harness.installPlugin(new SkillPlugin());

    expect(
      harness.getEntityRegistry().getEntityTypeConfig(SKILL_ENTITY_TYPE)
        .projectionSource,
    ).toBe(false);
  });

  it("does not register the AI-backed rule when derivation is disabled", async () => {
    const harness = createPluginHarness<SkillPlugin>({});
    const capabilities = await harness.installPlugin(
      new SkillPlugin({ enableSkillDerivation: false }),
    );

    expect(capabilities.projectionRules).toBeUndefined();
  });

  it("registers one scheduler-owned rule and no event-owned job", async () => {
    const harness = createPluginHarness<SkillPlugin>({});
    const enqueue = mock(async () => "job-1");
    const registerHandler = mock(() => {});
    const jobQueue = harness.getMockShell().getJobQueueService();
    harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue,
      registerHandler,
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

    expect("projections" in capabilities).toBe(false);
    expect(capabilities.projectionRules).toHaveLength(1);
    expect(capabilities.projectionRules?.[0]).toMatchObject({
      id: "skill-derivation",
      version: "2",
      sources: [
        { kind: "entity", types: ["topic"] },
        { kind: "entity", types: ["agent"] },
      ],
      targetType: "skill",
    });
    expect(registerHandler).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });
});
