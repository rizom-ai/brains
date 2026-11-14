import { describe, expect, it } from "bun:test";
import {
  agentContextContract,
  spaceNoticeActionContract,
} from "@brains/contracts";
import {
  SYSTEM_CHANNELS,
  conversationMessageAddedChannel,
  dashboardWidgetRegisterContract,
  jobProgressChannel,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  isDeclaredEntityType,
} from "@brains/plugins/test";
import { createConversationMemoryPlugins } from "./conversation-memory-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  evals: string[];
  widgets: string[];
}

async function installed(
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
  const plugins = createConversationMemoryPlugins();
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
      SYSTEM_CHANNELS.startupContentSettled,
      conversationMessageAddedChannel.name,
      jobProgressChannel.name,
      agentContextContract.name,
      spaceNoticeActionContract.name,
    ].map((channel) => [channel, bus.getHandlerCount(channel)]),
  );
}

const RETIRED = [
  "spaceId",
  "sourceSummaryId",
  "sourceMessageCount",
  "projectionVersion",
];

/**
 * What the conversation-memory package registers, pinned as the
 * conversation-memory entity plugin class registered it: brains read
 * summaries, decisions and action items by these types, action-board
 * writes action items through the action-item type, the pickup job runs
 * under conversation-memory:channel-action-items, the agent asks for
 * memory as context, and the Dashboard, the evals and chat notices reach
 * the package through what it registers.
 */
describe("the conversation-memory package's registered surface", () => {
  it("is the conversation-memory service beside its types, with no tools, resources, instructions or routes", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([
      // The class registered its three types inside itself, under
      // conversation-memory; each now installs as its own plugin, apart from
      // the service.
      ["summary", "entity", "@brains/conversation-memory", []],
      ["decision", "entity", "@brains/conversation-memory", []],
      ["action-item", "entity", "@brains/conversation-memory", []],
      ["conversation-memory", "service", "@brains/conversation-memory", []],
    ]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    expect(
      capabilities.flatMap(({ instructions }) =>
        instructions === undefined ? [] : [instructions],
      ),
    ).toEqual([]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
  });

  it("registers summary, decision and action-item with their stored-shape settings", async () => {
    const { shell, plugins } = await installed();
    // Nobody edits a summary by hand, in the brain's action policy.
    expect(
      plugins.flatMap((plugin) =>
        isDeclaredEntityType(plugin) && plugin.entityActionPolicy
          ? [plugin.entityActionPolicy]
          : [],
      ),
    ).toEqual([
      {
        summary: {
          create: "never",
          update: "never",
          delete: "never",
          extract: "never",
          publish: "never",
        },
      },
    ]);
    const registry = shell.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toEqual([
      "summary",
      "decision",
      "action-item",
    ]);
    expect(registry.getEntityTypeConfig("summary")).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
      retiredFields: ["conversationId", "entryCount", "projectionVersion"],
    });
    expect(registry.getEntityTypeConfig("decision")).toMatchObject({
      retiredFields: RETIRED,
    });
    expect(registry.getEntityTypeConfig("action-item")).toMatchObject({
      retiredFields: RETIRED,
      translatedFields: ["timeRange"],
      actionPolicy: { create: "never" },
    });
  });

  it("registers its templates, data source and pickup job in every process", async () => {
    for (const executionOnly of [false, true]) {
      const { shell } = await installed({ executionOnly });
      expect([...shell.getTemplates().keys()].sort()).toEqual([
        "conversation-memory:channel-action-items",
        "conversation-memory:summary-detail",
        "conversation-memory:summary-list",
      ]);
      expect(
        shell
          .getDataSourceRegistry()
          .list()
          .map(({ id }) => id),
      ).toEqual(["conversation-memory:entities"]);
      expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([
        "conversation-memory:channel-action-items",
      ]);
    }
  });

  it("registers its evals and widgets in the main process only", async () => {
    const main = await installed();
    expect(main.evals).toEqual([
      "conversation-memory:extractChannelActionItems",
      "conversation-memory:retrieveMemory",
      "conversation-memory:buildAgentContext",
    ]);
    expect(main.widgets).toEqual([
      "conversation-memory:action-items",
      "conversation-memory:decisions",
      "conversation-memory:recent",
    ]);
    const worker = await installed({ executionOnly: true });
    expect(worker.evals).toEqual([]);
    expect(worker.widgets).toEqual([]);
  });

  it("registers the daily channel catch-up, silent, in every process", async () => {
    for (const executionOnly of [false, true]) {
      const { shell } = await installed({ executionOnly });
      expect(
        shell.getRecurringCheck(
          "conversation-memory:channel-action-items-catch-up",
        ),
      ).toMatchObject({
        id: "channel-action-items-catch-up",
        cadence: "daily",
        deliverAlerts: false,
        includeInInbox: false,
      });
    }
  });

  it("hears the settled corpus, new messages, finished jobs, context requests and notice clicks in the main process only", async () => {
    expect(heard((await installed()).shell)).toEqual({
      [SYSTEM_CHANNELS.startupContentSettled]: 2,
      [conversationMessageAddedChannel.name]: 1,
      [jobProgressChannel.name]: 1,
      [agentContextContract.name]: 1,
      [spaceNoticeActionContract.name]: 1,
    });
    expect(heard((await installed({ executionOnly: true })).shell)).toEqual({
      [SYSTEM_CHANNELS.startupContentSettled]: 0,
      [conversationMessageAddedChannel.name]: 0,
      [jobProgressChannel.name]: 0,
      [agentContextContract.name]: 0,
      [spaceNoticeActionContract.name]: 0,
    });
  });
});
