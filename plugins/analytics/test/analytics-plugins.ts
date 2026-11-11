import {
  SYSTEM_CHANNELS,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import type { MockShell } from "@brains/plugins/test";
import { defineServicePlugin, z } from "@brains/sdk/services";
import {
  serviceRuntime,
  type ServiceRuntime,
} from "@brains/sdk/internal/service-runtime";
import { trafficSnapshotEntity } from "../src/entity/traffic-snapshot-entity";
import { createAnalyticsPackage, type AnalyticsDeps } from "../src/plugin";
import type { AnalyticsConfigInput } from "../src/config";

import packageJson from "../package.json";

const metadata = { name: packageJson.name, version: packageJson.version };

/**
 * The analytics package's plugins, as the canonical brain composes it
 * under its class's plugin id: the traffic-snapshot type's plugin, then
 * the analytics service.
 */
export function createAnalyticsPlugins(
  config: AnalyticsConfigInput = {},
  deps: AnalyticsDeps = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    createAnalyticsPackage(deps),
    config,
    metadata,
    { pluginId: "analytics" },
  );
}

/** The traffic-snapshot type's plugin alone, as the package installs it. */
export function createTrafficSnapshotPlugin(): Plugin {
  const [plugin] = createAnalyticsPlugins();
  if (!plugin)
    throw new Error("The package installs no traffic-snapshot plugin");
  return plugin;
}

/** The analytics service alone, as the package installs it. */
export function createAnalyticsPlugin(
  config: AnalyticsConfigInput = {},
  deps: AnalyticsDeps = {},
): Plugin {
  const [, plugin] = createAnalyticsPlugins(config, deps);
  if (!plugin) throw new Error("The package installs no service plugin");
  return plugin;
}

/**
 * The runtime a first-party service reaches on a test shell, under the
 * analytics plugin id with the traffic-snapshot type installed, for a test
 * of one part the package builds on it: its widget, its workspace, its
 * snapshot store.
 */
export async function analyticsRuntime(
  shell: MockShell,
): Promise<ServiceRuntime> {
  let runtime: ServiceRuntime | undefined;
  const plugins = instantiatePluginPackageDefinition(
    defineServicePlugin({
      id: "analytics",
      config: z.object({}),
      entities: [trafficSnapshotEntity],
      setup: (context) => {
        runtime = serviceRuntime(context);
        return {};
      },
    }),
    {},
    metadata,
    { pluginId: "analytics" },
  );
  for (const plugin of plugins) await plugin.register(shell);
  if (!runtime) throw new Error("The probe did not set up");
  return runtime;
}

/** Announce that every plugin registered, as the shell does once. */
export async function pluginsRegistered(shell: MockShell): Promise<void> {
  await shell.getMessageBus().send({
    type: SYSTEM_CHANNELS.pluginsRegistered,
    payload: {},
    sender: "shell",
    broadcast: true,
  });
}
