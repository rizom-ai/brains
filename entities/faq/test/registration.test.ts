import { describe, expect, it } from "bun:test";
import { askedBeforeContract } from "@brains/contracts";
import {
  conversationGuestMessageAddedChannel,
  conversationMessageAddedChannel,
  embeddingReadyChannel,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  registerAll,
} from "@brains/plugins/test";
import type { FaqConfigInput } from "../src";
import { createFaqPlugins } from "./faq-plugins";

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  evals: string[];
}

async function installed(
  config: FaqConfigInput = {},
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell();
  const evals: string[] = [];
  shell.registerEvalHandler = (pluginId: string, handlerId: string): void => {
    evals.push(`${pluginId}:${handlerId}`);
  };
  const plugins = createFaqPlugins(config);
  const capabilities = await registerAll(shell, plugins, options);
  shell.getInboxRegistry().finalize();
  return { shell, plugins, capabilities, evals };
}

/** How many handlers hear each channel the package listens on. */
function heard(shell: MockShell): Record<string, number> {
  const bus = shell.getMessageBus();
  return Object.fromEntries(
    [
      conversationMessageAddedChannel.name,
      conversationGuestMessageAddedChannel.name,
      embeddingReadyChannel.name,
      askedBeforeContract.name,
    ].map((channel) => [channel, bus.getHandlerCount(channel)]),
  );
}

/**
 * What the faq package registers, pinned as the faq entity plugin class
 * registered it and held on the definition: chats are captured into FAQs by the jobs queued under
 * these types, a guest's question a published FAQ answers is answered
 * from it, the owner reviews drafts in the Inbox, and sites render the
 * published ones.
 */
describe("the faq package's registered surface", () => {
  it("is the faq service beside its type, with no tools, resources or routes", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([
      // The class registered the faq type inside itself, under faq; the
      // type now installs as its own plugin, apart from the service.
      ["faq-entity", "entity", "@brains/faq", []],
      ["faq", "service", "@brains/faq", []],
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

  it("registers the faq type: out of projections and broad search, sources translated", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getAllEntityTypes()).toEqual(["faq"]);
    expect(registry.getEntityTypeConfig("faq")).toMatchObject({
      projectionSource: false,
      projectionSourceRole: "excluded",
      includeInBroadSearch: false,
      translatedFields: ["sources"],
      publish: { publishStatuses: ["published"] },
    });
  });

  it("registers its section template and data source under faq", async () => {
    const { shell } = await installed();
    expect([...shell.getTemplates().keys()]).toEqual(["faq:faq-section"]);
    expect(
      shell
        .getDataSourceRegistry()
        .list()
        .map(({ id }) => id),
    ).toEqual(["faq:entities"]);
  });

  it("handles capture and reconcile jobs in every process, enabled or not", async () => {
    for (const [config, executionOnly] of [
      [{}, false],
      [{}, true],
      [{ enabled: false }, false],
    ] as const) {
      const { shell } = await installed(config, { executionOnly });
      expect(shell.getJobQueueService().getRegisteredTypes()).toEqual([
        "faq:faq-capture",
        "faq:faq-reconcile",
      ]);
    }
  });

  it("offers its Inbox source and evals in the main process only", async () => {
    const main = await installed();
    expect(
      main.shell
        .getInboxRegistry()
        .listSources()
        .map(({ sourceId, displayName }) => [sourceId, displayName]),
    ).toEqual([["faq", "FAQs"]]);
    expect(main.evals).toEqual(["faq:classifyExchange", "faq:sameQuestion"]);
    const worker = await installed({}, { executionOnly: true });
    expect(worker.shell.getInboxRegistry().listSources()).toEqual([]);
    expect(worker.evals).toEqual([]);
    // Disabled capture keeps the Inbox and the evals.
    const disabled = await installed({ enabled: false });
    expect(
      disabled.shell
        .getInboxRegistry()
        .listSources()
        .map(({ sourceId }) => sourceId),
    ).toEqual(["faq"]);
    expect(disabled.evals).toEqual([
      "faq:classifyExchange",
      "faq:sameQuestion",
    ]);
  });

  it("hears chats and answers asked-before questions in the main process, folds in every process, and none of it disabled", async () => {
    expect(heard((await installed()).shell)).toEqual({
      [conversationMessageAddedChannel.name]: 1,
      [conversationGuestMessageAddedChannel.name]: 1,
      [embeddingReadyChannel.name]: 1,
      [askedBeforeContract.name]: 1,
    });
    expect(heard((await installed({}, { executionOnly: true })).shell)).toEqual(
      {
        [conversationMessageAddedChannel.name]: 0,
        [conversationGuestMessageAddedChannel.name]: 0,
        [embeddingReadyChannel.name]: 1,
        [askedBeforeContract.name]: 0,
      },
    );
    expect(heard((await installed({ enabled: false })).shell)).toEqual({
      [conversationMessageAddedChannel.name]: 0,
      [conversationGuestMessageAddedChannel.name]: 0,
      [embeddingReadyChannel.name]: 0,
      [askedBeforeContract.name]: 0,
    });
  });
});
