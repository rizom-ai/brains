import { describe, expect, it } from "bun:test";
import { siteHeadScriptsContract } from "@brains/contracts";
import {
  SYSTEM_CHANNELS,
  dashboardWidgetRegisterContract,
  studioWorkspaceRegisterContract,
  studioWorkspaceUnregisterContract,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import type { AnalyticsConfigInput } from "../src/config";
import { createAnalyticsPlugins } from "./analytics-plugins";

const cloudflare: AnalyticsConfigInput = {
  cloudflare: {
    accountId: "account",
    apiToken: "token",
    siteTag: "site",
    beaconToken: "beacon",
  },
};

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  events: string[];
}

async function installed(
  config: AnalyticsConfigInput = {},
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell();
  const bus = shell.getMessageBus();
  const events: string[] = [];
  bus.subscribe<{ id: string }, { workspaceUrl: string }>(
    studioWorkspaceRegisterContract.name,
    async (message) => {
      events.push(`workspace ${message.payload.id}`);
      return {
        success: true,
        data: { workspaceUrl: `/studio/workspaces/${message.payload.id}` },
      };
    },
  );
  bus.subscribe<{ workspaceId: string }>(
    studioWorkspaceUnregisterContract.name,
    async (message) => {
      events.push(`unregister ${message.payload.workspaceId}`);
      return { success: true };
    },
  );
  bus.subscribe<{ id: string; pluginId: string }>(
    dashboardWidgetRegisterContract.name,
    async (message) => {
      events.push(`widget ${message.payload.pluginId}:${message.payload.id}`);
      return { success: true };
    },
  );
  const plugins = createAnalyticsPlugins(config);
  const capabilities: PluginCapabilities[] = [];
  for (const plugin of plugins) {
    capabilities.push(
      await plugin.register(
        shell,
        options.executionOnly ? { executionOnly: true } : undefined,
      ),
    );
  }
  return { shell, plugins, capabilities, events };
}

/**
 * What the analytics package registers, pinned as its traffic-snapshot
 * entity plugin class and its analytics service class registered it:
 * system_analytics answers its traffic reports, site builds carry the
 * beacon, the daily check captures traffic, and Studio and the Dashboard
 * show the Traffic workspace and widget.
 */
describe("the analytics package's registered surface", () => {
  it("is the traffic-snapshot entity and the analytics service, with no tools or routes", async () => {
    const { plugins, capabilities } = await installed();
    expect(
      plugins.map(({ id, type, packageName, dependencies }) => [
        id,
        type,
        packageName,
        dependencies ?? [],
      ]),
    ).toEqual([
      ["traffic-snapshot", "entity", "@brains/analytics", []],
      ["analytics", "service", "@brains/analytics", []],
    ]);
    expect(capabilities.flatMap(({ tools }) => tools)).toEqual([]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
  });

  it("registers the traffic-snapshot type: system, restricted, never edited by hand", async () => {
    const { shell } = await installed();
    const registry = shell.getEntityRegistry();
    expect(registry.getEntityTypeConfig("traffic-snapshot")).toMatchObject({
      classification: "system",
      actionPolicy: {
        create: "never",
        update: "never",
        delete: "never",
        extract: "never",
        publish: "never",
      },
      embeddable: false,
      retiredFields: ["week", "start", "end"],
      fullTextSearchable: false,
      projectionSource: false,
      projectionSourceRole: "excluded",
    });
    expect(registry.getPersistValidator("traffic-snapshot")).toBeFunction();
  });

  it("registers its three traffic reports in the main process, and none in a worker", async () => {
    const reports = (shell: MockShell): string[] =>
      shell
        .getAnalyticsRegistry()
        .getDefinitions()
        .map(({ type }) => type)
        .sort();
    expect(reports((await installed()).shell)).toEqual([
      "traffic-by-entity",
      "traffic-overview",
      "traffic-series",
    ]);
    expect(
      reports((await installed({}, { executionOnly: true })).shell),
    ).toEqual([]);
  });

  it("answers the beacon in every process and checks traffic daily, only with Cloudflare", async () => {
    for (const executionOnly of [false, true]) {
      const plain = await installed({}, { executionOnly });
      expect(
        plain.shell
          .getMessageBus()
          .getHandlerCount(siteHeadScriptsContract.name),
      ).toBe(0);
      expect(plain.shell.getRecurringCheck("analytics:traffic-capture")).toBe(
        undefined,
      );
      const configured = await installed(cloudflare, { executionOnly });
      expect(
        configured.shell
          .getMessageBus()
          .getHandlerCount(siteHeadScriptsContract.name),
      ).toBe(1);
      expect(
        configured.shell.getRecurringCheck("analytics:traffic-capture")
          ?.cadence,
      ).toBe("daily");
    }
  });

  it("shows its workspace and widget once the brain is ready, and takes the workspace off when it shuts down", async () => {
    const brain = await installed();
    brain.events.push("plugins registered");
    await brain.shell.getMessageBus().send({
      type: SYSTEM_CHANNELS.pluginsRegistered,
      payload: {},
      sender: "shell",
    });
    brain.events.push("ready");
    for (const plugin of brain.plugins) await plugin.ready?.();
    for (const plugin of brain.plugins) await plugin.shutdown?.();
    expect(brain.events).toEqual([
      "plugins registered",
      "ready",
      "workspace analytics:traffic",
      "widget analytics:traffic",
      "unregister analytics:traffic",
    ]);
  });
});
