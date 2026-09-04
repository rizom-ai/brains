import { describe, expect, it, mock } from "bun:test";
import type { Plugin, PluginCapabilities } from "@brains/plugins";
import { instantiatePluginPackageDefinition } from "@brains/plugins";
import { createPluginHarness } from "@brains/plugins/test";
import agentDiscovery from "../src";
import { SKILL_ENTITY_TYPE } from "../src/lib/constants";

const PACKAGE_METADATA = {
  name: "@brains/agent-discovery",
  version: "0.1.0",
};

async function install(
  harness: ReturnType<typeof createPluginHarness<Plugin>>,
  config: Record<string, unknown> = {},
): Promise<PluginCapabilities[]> {
  const plugins = instantiatePluginPackageDefinition(
    agentDiscovery,
    config,
    PACKAGE_METADATA,
  );
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(await harness.installPlugin(plugin));
  }
  return capabilities;
}

/** The rules the package registered, across whichever plugin carries them. */
function rules(
  capabilities: PluginCapabilities[],
): NonNullable<PluginCapabilities["projectionRules"]> {
  return capabilities.flatMap((one) => one.projectionRules ?? []);
}

describe("skill derivation is scheduler-owned", () => {
  it("registers skill as a projection output, never a source", async () => {
    const harness = createPluginHarness<Plugin>({});
    await install(harness);

    expect(
      harness.getEntityRegistry().getEntityTypeConfig(SKILL_ENTITY_TYPE)
        .projectionSource,
    ).toBe(false);

    harness.reset();
  });

  it("registers no rule when derivation is disabled", async () => {
    const harness = createPluginHarness<Plugin>({});
    const capabilities = await install(harness, {
      enableSkillDerivation: false,
    });

    expect(rules(capabilities)).toHaveLength(0);

    harness.reset();
  });

  it("registers one rule and no event-owned job", async () => {
    const harness = createPluginHarness<Plugin>({});
    const enqueue = mock(async () => "job-1");
    const registerHandler = mock((_type: string) => {});
    const jobQueue = harness.getMockShell().getJobQueueService();
    harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue,
      registerHandler,
    });

    const capabilities = await install(harness);
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

    const registered = rules(capabilities);
    expect(registered).toHaveLength(1);
    expect(registered[0]).toMatchObject({
      id: "skill-derivation",
      version: "2",
      sources: [
        { kind: "entity", types: ["topic"] },
        { kind: "entity", types: ["agent"] },
      ],
      targetType: "skill",
    });
    // The agent type declares generation — creating a contact from a URL —
    // so a handler for that is expected. What must not exist is one that
    // derives skills, which is the scheduler's job.
    const handlerTypes = registerHandler.mock.calls.map(([type]) => type);
    expect(handlerTypes.filter((type) => type.includes("skill"))).toEqual([]);
    expect(enqueue).not.toHaveBeenCalled();

    harness.reset();
  });

  it("does not derive on a raw entity event", async () => {
    const harness = createPluginHarness<Plugin>({});
    const enqueue = mock(async () => "job-1");
    const jobQueue = harness.getMockShell().getJobQueueService();
    harness.getMockShell().getJobQueueService = (): typeof jobQueue => ({
      ...jobQueue,
      enqueue,
    });
    await install(harness);

    await harness.sendMessage(
      "entity:updated",
      { entityType: "topic", entityId: "topic-1" },
      "entity-service",
    );

    expect(enqueue).not.toHaveBeenCalled();

    harness.reset();
  });
});
