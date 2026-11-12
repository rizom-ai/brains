import { describe, expect, it } from "bun:test";
import {
  atprotoBrainCardConflictChannel,
  atprotoBrainCardDiscoveredChannel,
  atprotoBrainCardUnavailableChannel,
  atprotoBrainDiscoveredChannel,
} from "@brains/atproto-contracts";
import {
  EntityPlugin,
  SYSTEM_CHANNELS,
  dashboardWidgetRegisterContract,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { AgentDiscoveryCompositeConfigInput } from "../src";
import { getAgentDiscoveryInstructions } from "../src/lib/agent-instructions";
import { createAgentDiscoveryPlugins } from "./agent-discovery-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  evals: string[];
  widgets: string[];
}

async function installed(
  config: AgentDiscoveryCompositeConfigInput = {},
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell();
  const evals: string[] = [];
  shell.registerEvalHandler = (pluginId: string, handlerId: string): void => {
    evals.push(`${pluginId}:${handlerId}`);
  };
  const widgets: string[] = [];
  shell
    .getMessageBus()
    .subscribe<{ id: string; pluginId: string }>(
      dashboardWidgetRegisterContract.name,
      async (message) => {
        widgets.push(`${message.payload.pluginId}:${message.payload.id}`);
        return { success: true };
      },
    );
  const plugins = createAgentDiscoveryPlugins(config);
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(
      await plugin.register(
        shell,
        options.executionOnly ? { executionOnly: true } : undefined,
      ),
    );
  }
  await shell.getMessageBus().send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "shell",
    broadcast: true,
  });
  return { shell, plugins, capabilities, evals, widgets };
}

/** How many handlers hear each channel the package listens on. */
function heard(shell: MockShell): Record<string, number> {
  const bus = shell.getMessageBus();
  return Object.fromEntries(
    [
      atprotoBrainCardDiscoveredChannel.name,
      atprotoBrainCardUnavailableChannel.name,
      atprotoBrainDiscoveredChannel.name,
      atprotoBrainCardConflictChannel.name,
    ].map((channel) => [channel, bus.getHandlerCount(channel)]),
  );
}

/** A registered check's schedule, by its full id. */
function check(shell: MockShell, id: string): unknown {
  const found = shell.getRecurringCheck(id);
  return (
    found && {
      cadence: found.cadence,
      deliverAlerts: found.deliverAlerts,
      includeInInbox: found.includeInInbox,
    }
  );
}

/**
 * What the agents capability registers, pinned as its three classes
 * registered it: the agent type's plugin agent-discovery (which the
 * organization site depends on, and whose templates, data sources and
 * widgets sites and the Dashboard name), the agent tools service agent, and
 * the skill type's plugin skill. Brains read agents and skills by their
 * types, the agent:generation job creates an agent from its card, and the
 * atproto plugin's card events reach the directory through these channels.
 */
describe("the agents capability's registered surface", () => {
  it("is the agent-discovery and skill types beside the agent service, with the agent tools", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([
      ["agent-discovery", "entity", "@brains/agent-discovery", []],
      ["agent", "service", "@brains/agent-discovery", []],
      ["skill", "entity", "@brains/agent-discovery", []],
    ]);
    expect(
      capabilities.flatMap(({ tools }) =>
        tools.map(({ name, visibility }) => [name, visibility]),
      ),
    ).toEqual([
      ["agent_connect", "trusted"],
      ["agent_scan_directories", "trusted"],
      ["agent_set_trust_level", "admin"],
      ["network_ask", "public"],
    ]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    expect(
      capabilities.flatMap(({ instructions }) =>
        instructions === undefined ? [] : [instructions],
      ),
    ).toEqual([
      [
        getAgentDiscoveryInstructions(),
        'Agent approval/archive is a status field update on `entityType: "agent"`.',
      ].join("\n"),
    ]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
  });

  it("registers the agent and skill types as system types, with no action policy of their own", async () => {
    const { shell, plugins } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toEqual(["agent", "skill"]);
    expect(registry.getEntityTypeConfig("agent")).toMatchObject({
      classification: "system",
      projectionSourceRole: "supporting",
      retiredFields: [
        "cardObservedAt",
        "cardLastCheckedAt",
        "a2aEndpoint",
        "did",
        "anchorDid",
      ],
    });
    expect(registry.getEntityTypeConfig("skill")).toMatchObject({
      classification: "system",
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    // Neither type adds a rule to the brain's action policy.
    expect(
      plugins.flatMap((plugin) =>
        plugin instanceof EntityPlugin && plugin.entityActionPolicy
          ? [plugin.entityActionPolicy]
          : [],
      ),
    ).toEqual([]);
  });

  it("registers its templates, data sources and generation job in every process", async () => {
    for (const executionOnly of [false, true]) {
      const { shell } = await installed({}, { executionOnly });
      expect([...shell.getTemplates().keys()].sort()).toEqual([
        "agent-discovery:agent-detail",
        "agent-discovery:agent-list",
        "agent-discovery:proximity-map",
        "skill:skill-derivation",
      ]);
      expect(
        shell
          .getDataSourceRegistry()
          .list()
          .map(({ id }) => id)
          .sort(),
      ).toEqual(["agent-discovery:entities", "agent-discovery:proximity-map"]);
      expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([
        "agent:generation",
      ]);
    }
  });

  it("derives skills by the skill-derivation rule only with derivation on", async () => {
    expect(
      (await installed()).capabilities.flatMap(({ projectionRules }) =>
        (projectionRules ?? []).map(({ id }) => id),
      ),
    ).toEqual(["skill-derivation"]);
    expect(
      (await installed({ enableSkillDerivation: false })).capabilities.flatMap(
        ({ projectionRules }) => (projectionRules ?? []).map(({ id }) => id),
      ),
    ).toEqual([]);
  });

  it("registers the skill eval and its three widgets in the main process only", async () => {
    const main = await installed();
    expect(main.evals).toEqual(["skill:deriveSkills"]);
    expect(main.widgets).toEqual([
      "agent-discovery:agent-network",
      "agent-discovery:agent-proximity",
      "skill:skills",
    ]);
    const worker = await installed({}, { executionOnly: true });
    expect(worker.evals).toEqual([]);
    expect(worker.widgets).toEqual([]);
  });

  it("refreshes cards and scans directories daily, alerting on new agents only when asked", async () => {
    for (const executionOnly of [false, true]) {
      const { shell } = await installed({}, { executionOnly });
      expect(check(shell, "agent-discovery:agent-card-refresh")).toEqual({
        cadence: "daily",
        deliverAlerts: false,
        includeInInbox: undefined,
      });
      expect(check(shell, "agent:directory-scan")).toEqual({
        cadence: "daily",
        deliverAlerts: false,
        includeInInbox: undefined,
      });
    }
    expect(
      check(
        (await installed({ notifyOnNewAgents: true })).shell,
        "agent:directory-scan",
      ),
    ).toEqual({
      cadence: "daily",
      deliverAlerts: true,
      includeInInbox: undefined,
    });
  });

  it("purges the retired network-piece type on every registration, in every process", async () => {
    for (const executionOnly of [false, true]) {
      const purged: string[] = [];
      // Each boot registers the package again.
      for (const boot of [1, 2]) {
        const shell = createMockShell();
        shell.getEntityService().purgeEntityType = async (
          entityType: string,
        ): Promise<number> => {
          purged.push(entityType);
          return 0;
        };
        for (const plugin of createAgentDiscoveryPlugins())
          await plugin.register(
            shell,
            executionOnly ? { executionOnly: true } : undefined,
          );
        expect(purged).toEqual(Array<string>(boot).fill("network-piece"));
      }
    }
  });

  it("offers the agent sightings Inbox source", async () => {
    const { shell } = await installed();
    const inbox = shell.getInboxRegistry();
    inbox.finalize();
    expect(inbox.listSources().map(({ sourceId }) => sourceId)).toEqual([
      "agent-sightings",
    ]);
  });

  it("hears the atproto card events in the main process only", async () => {
    expect(heard((await installed()).shell)).toEqual({
      [atprotoBrainCardDiscoveredChannel.name]: 1,
      [atprotoBrainCardUnavailableChannel.name]: 1,
      [atprotoBrainDiscoveredChannel.name]: 1,
      [atprotoBrainCardConflictChannel.name]: 1,
    });
    expect(heard((await installed({}, { executionOnly: true })).shell)).toEqual(
      {
        [atprotoBrainCardDiscoveredChannel.name]: 0,
        [atprotoBrainCardUnavailableChannel.name]: 0,
        [atprotoBrainDiscoveredChannel.name]: 0,
        [atprotoBrainCardConflictChannel.name]: 0,
      },
    );
  });
});
