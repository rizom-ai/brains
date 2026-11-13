import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import { topicsPackage, type TopicsPluginConfigInput } from "../src";
import packageJson from "../package.json";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

/**
 * The topics package's plugins, as the canonical brain installs them:
 * under the topics class's plugin id, its topic type as itself.
 */
export function createTopicsPlugins(
  config: TopicsPluginConfigInput = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    topicsPackage,
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "topics" },
  );
}

type TopicPlugin = DeclaredEntityTypePlugin;

/** The topic type's adapter, as the installed package declares it. */
export function topicTypeAdapter(): TopicPlugin["adapter"] {
  const plugin = createTopicsPlugins().find(
    (candidate): candidate is TopicPlugin => isDeclaredEntityType(candidate),
  );
  if (!plugin) throw new Error("The topics package declares no type");
  return plugin.adapter;
}

/**
 * Install the topics package on a test harness, as a brain installs it:
 * the topic type first, then the service. The service's capabilities.
 */
export async function installTopics(
  harness: { installPlugin(plugin: Plugin): Promise<PluginCapabilities> },
  config: TopicsPluginConfigInput = {},
): Promise<PluginCapabilities> {
  const installed: PluginCapabilities[] = [];
  for (const plugin of createTopicsPlugins(config))
    installed.push(await harness.installPlugin(plugin));
  const service = installed.at(-1);
  if (!service) throw new Error("The topics package installed nothing");
  return service;
}
