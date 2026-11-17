import { describe, expect, it } from "bun:test";
import {
  topicSourceTypesContract,
  topicTitlesContract,
} from "@brains/contracts";
import {
  SYSTEM_CHANNELS,
  dashboardWidgetRegisterContract,
  entityCreatedChannel,
  entityDeletedChannel,
  entityUpdatedChannel,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  registerAll,
} from "@brains/plugins/test";
import type { TopicsPluginConfigInput } from "../src";
import { createTopicsPlugins } from "./topics-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  evals: string[];
  widgets: string[];
}

async function installed(
  config: TopicsPluginConfigInput = {},
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
  const plugins = createTopicsPlugins(config);
  const capabilities = await registerAll(shell, plugins, options);
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
      entityCreatedChannel.name,
      entityUpdatedChannel.name,
      entityDeletedChannel.name,
      SYSTEM_CHANNELS.startupContentSettled,
      topicTitlesContract.name,
      topicSourceTypesContract.name,
    ].map((channel) => [channel, bus.getHandlerCount(channel)]),
  );
}

const EVALS = [
  "topics:extractFromEntity",
  "topics:checkMergeSimilarity",
  "topics:detectMergeCandidate",
  "topics:processTopicWithAutoMerge",
  "topics:rebuildTopics",
  "topics:reconcileExistingTopics",
  "topics:extractSequentially",
  "topics:rebuildCorpusFixture",
  "topics:batchExtract",
];

/**
 * What the topics package registers, pinned as the topics entity plugin
 * class registered it and held on the definition: brains and sites read topics by this type, the
 * extraction job runs under topics:extract, other packages ask for the
 * public titles and the source types, and system_analytics, the Dashboard
 * and AT Protocol publishing read topics through what it registers.
 */
describe("the topics package's registered surface", () => {
  it("is the topics service beside its type, with no tools, resources, instructions or routes", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([
      // The class registered the topic type inside itself, under topics;
      // the type now installs as its own plugin, apart from the service.
      ["topic", "entity", "@brains/topics", []],
      ["topics", "service", "@brains/topics", []],
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

  it("registers the topic type, weighted down and out of projections", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toEqual(["topic"]);
    expect(registry.getEntityTypeConfig("topic")).toMatchObject({
      weight: 0.5,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
  });

  it("registers its templates and data source under topics in every process", async () => {
    for (const executionOnly of [false, true]) {
      const { shell } = await installed({}, { executionOnly });
      expect([...shell.getTemplates().keys()].sort()).toEqual([
        "topics:description",
        "topics:extraction",
        "topics:merge-synthesis",
        "topics:topic-detail",
        "topics:topic-list",
        "topics:votes",
      ]);
      expect(
        shell
          .getDataSourceRegistry()
          .list()
          .map(({ id }) => id),
      ).toEqual(["topics:entities"]);
    }
  });

  it("handles extraction in every process, only with auto extraction on", async () => {
    expect(
      (await installed()).shell.getJobQueueService().getRegisteredTypes(),
    ).toEqual(["topics:extract"]);
    expect(
      (await installed({}, { executionOnly: true })).shell
        .getJobQueueService()
        .getRegisteredTypes(),
    ).toEqual(["topics:extract"]);
    expect(
      (await installed({ enableAutoExtraction: false })).shell
        .getJobQueueService()
        .getRegisteredTypes(),
    ).toEqual([]);
  });

  it("registers its evals, report and widget in the main process only", async () => {
    for (const config of [{}, { enableAutoExtraction: false }]) {
      const main = await installed(config);
      expect(main.evals).toEqual(EVALS);
      expect(main.widgets).toEqual(["topics:topics"]);
      expect(
        main.shell
          .getAnalyticsRegistry()
          .getDefinitions()
          .map(({ type }) => type),
      ).toEqual(["topic-distribution"]);
    }
    const worker = await installed({}, { executionOnly: true });
    expect(worker.evals).toEqual([]);
    expect(worker.widgets).toEqual([]);
    expect(worker.shell.getAnalyticsRegistry().getDefinitions()).toEqual([]);
  });

  it("projects topics to AT Protocol in every process", async () => {
    for (const executionOnly of [false, true]) {
      const { shell } = await installed({}, { executionOnly });
      expect(
        shell
          .getAtprotoProjectionRegistry()
          .list()
          .map(({ entityType, collection }) => [entityType, collection]),
      ).toEqual([["topic", "ai.rizom.brain.topic"]]);
    }
  });

  it("hears entity changes everywhere, the settled corpus and the titles in the main process, the source types everywhere", async () => {
    expect(heard((await installed()).shell)).toEqual({
      [entityCreatedChannel.name]: 1,
      [entityUpdatedChannel.name]: 1,
      [entityDeletedChannel.name]: 1,
      [SYSTEM_CHANNELS.startupContentSettled]: 1,
      [topicTitlesContract.name]: 1,
      [topicSourceTypesContract.name]: 1,
    });
    expect(heard((await installed({}, { executionOnly: true })).shell)).toEqual(
      {
        [entityCreatedChannel.name]: 1,
        [entityUpdatedChannel.name]: 1,
        [entityDeletedChannel.name]: 1,
        [SYSTEM_CHANNELS.startupContentSettled]: 0,
        [topicTitlesContract.name]: 0,
        [topicSourceTypesContract.name]: 1,
      },
    );
    expect(
      heard((await installed({ enableAutoExtraction: false })).shell),
    ).toEqual({
      [entityCreatedChannel.name]: 0,
      [entityUpdatedChannel.name]: 0,
      [entityDeletedChannel.name]: 0,
      [SYSTEM_CHANNELS.startupContentSettled]: 0,
      [topicTitlesContract.name]: 1,
      [topicSourceTypesContract.name]: 1,
    });
  });
});
