import { afterEach, describe, expect, it } from "bun:test";
import {
  SYSTEM_CHANNELS,
  dashboardWidgetRegisterContract,
  studioWorkspaceRegisterContract,
  studioWorkspaceUnregisterContract,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  createMockShell,
  type MockShell,
  registerAll,
} from "@brains/plugins/test";
import { createContentPipelinePlugins } from "./content-pipeline-plugins";

const installedPlugins: Plugin[] = [];
afterEach(async () => {
  for (const plugin of installedPlugins.splice(0)) await plugin.shutdown?.();
});

/** The channels the package answers or hears, by the name the bus routes. */
const channels = [
  "publish:register",
  "publish-assets:register",
  "generate:report:success",
  "generate:report:failure",
  "publish:completed",
  "publish:failed",
  "entity:created",
  "entity:updated",
] as const;

interface Installed {
  shell: MockShell;
  plugins: Plugin[];
  capabilities: PluginCapabilities[];
  /** Studio and Dashboard registrations, in the order they arrived. */
  events: string[];
}

async function installed(
  options: { executionOnly?: boolean } = {},
): Promise<Installed> {
  const shell = createMockShell();
  const bus = shell.getMessageBus();
  const events: string[] = [];
  bus.subscribe<{ id: string; pluginId: string }, { workspaceUrl: string }>(
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
  const plugins = createContentPipelinePlugins();
  installedPlugins.push(...plugins);
  const capabilities = await registerAll(shell, plugins, options);
  return { shell, plugins, capabilities, events };
}

async function ready({ shell, plugins, events }: Installed): Promise<void> {
  events.push("plugins registered");
  await shell.getMessageBus().send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "shell",
  });
  events.push("ready");
  for (const plugin of plugins) await plugin.ready?.();
}

/**
 * What the content-pipeline package registers, pinned as the
 * content-pipeline plugin class registered it: brains call its publishing
 * tool by name, entity packages register their publish providers and
 * assets over its contracts, generators report to it, and Studio and the
 * Dashboard show its Publishing workspace and pipeline widget.
 */
describe("the content-pipeline package's registered surface", () => {
  it("is the content-pipeline service, serving no routes", async () => {
    const { plugins } = await installed();
    const service = plugins.find(({ type }) => type === "service");
    expect([
      service?.id,
      service?.packageName,
      service?.dependencies ?? [],
    ]).toEqual(["content-pipeline", "@brains/content-pipeline", []]);
    for (const plugin of plugins) {
      expect(plugin.getWebRoutes?.() ?? []).toEqual([]);
      expect(plugin.getApiRoutes?.() ?? []).toEqual([]);
    }
  });

  it("registers publishing_manage under its bare name, and no resources or instructions", async () => {
    const { capabilities } = await installed();
    expect(
      capabilities.flatMap(({ tools }) =>
        tools.map((tool) => ({
          name: tool.name,
          visibility: tool.visibility,
          sideEffects: tool.sideEffects,
          cli: tool.cli,
          input: Object.keys(tool.inputSchema),
        })),
      ),
    ).toEqual([
      {
        name: "publishing_manage",
        visibility: "admin",
        sideEffects: "external",
        cli: undefined,
        input: [
          "action",
          "entityType",
          "entityId",
          "position",
          "id",
          "slug",
          "confirmed",
          "confirmationToken",
          "contentHash",
          "expiresAt",
        ],
      },
    ]);
    expect(capabilities.flatMap(({ resources }) => resources)).toEqual([]);
    expect(capabilities.map(({ instructions }) => instructions)).toEqual([
      undefined,
    ]);
  });

  it("answers and hears its channels in the main process, and only the generation reports in a worker", async () => {
    const main = await installed();
    const worker = await installed({ executionOnly: true });
    const counts = (shell: MockShell): Record<string, number> =>
      Object.fromEntries(
        channels.map((channel) => [
          channel,
          shell.getMessageBus().getHandlerCount(channel),
        ]),
      );
    expect(counts(main.shell)).toEqual({
      "publish:register": 1,
      "publish-assets:register": 1,
      "generate:report:success": 1,
      "generate:report:failure": 1,
      "publish:completed": 1,
      "publish:failed": 1,
      "entity:created": 1,
      "entity:updated": 1,
    });
    expect(counts(worker.shell)).toEqual({
      "publish:register": 0,
      "publish-assets:register": 0,
      "generate:report:success": 1,
      "generate:report:failure": 1,
      "publish:completed": 0,
      "publish:failed": 0,
      "entity:created": 0,
      "entity:updated": 0,
    });
  });

  it("shows its widget once every plugin registered and its workspace once the brain is ready, and takes the workspace off when it shuts down", async () => {
    const brain = await installed();
    await ready(brain);
    for (const plugin of brain.plugins) await plugin.shutdown?.();
    installedPlugins.length = 0;
    expect(brain.events).toEqual([
      "plugins registered",
      // Registered once every plugin has, as a declared widget is, where
      // the class registered it once the brain was ready.
      "widget content-pipeline:publication-pipeline",
      "ready",
      "workspace content-pipeline:publishing",
      "unregister content-pipeline:publishing",
    ]);
  });
});
