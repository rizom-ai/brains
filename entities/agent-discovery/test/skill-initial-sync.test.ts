import { describe, expect, it, mock } from "bun:test";
import { createPluginHarness } from "@brains/plugins/test";
import type { PluginCapabilities } from "@brains/plugins";
import { SKILL_ENTITY_TYPE } from "../src/lib/constants";
import { skillPlugins } from "./agent-discovery-plugins";

/** The skill package's plugins installed in order, and the rules they declare. */
async function rulesOf(
  harness: ReturnType<typeof createPluginHarness>,
  derived?: boolean,
): Promise<PluginCapabilities["projectionRules"]> {
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of skillPlugins(derived === undefined ? {} : { derived }))
    capabilities.push(await harness.installPlugin(plugin));
  return capabilities.flatMap(({ projectionRules }) => projectionRules ?? []);
}

describe("Skill projection registration", () => {
  it("registers skill as a projection output", async () => {
    const harness = createPluginHarness({});
    await rulesOf(harness);

    expect(
      harness.getEntityRegistry().getEntityTypeConfig(SKILL_ENTITY_TYPE)
        .projectionSource,
    ).toBe(false);
  });

  it("does not register the AI-backed rule when derivation is disabled", async () => {
    expect(await rulesOf(createPluginHarness({}), false)).toEqual([]);
  });

  it("registers one scheduler-owned rule and no event-owned job", async () => {
    const harness = createPluginHarness({});
    const enqueue = mock(async () => "job-1");
    const registerHandler = mock(() => {});
    const jobQueue = harness.getMockShell().getJobQueueService();
    harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue,
      registerHandler,
    });

    const rules = await rulesOf(harness);
    await harness.sendMessage(
      "sync:initial:completed",
      { success: true },
      "directory-sync",
    );

    expect(rules).toHaveLength(1);
    expect(rules?.[0]).toMatchObject({
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
