import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
} from "@brains/plugins";
import {
  agentDiscoveryCompositeConfigSchema,
  createAgentDiscoveryPackages,
  type AgentDiscoveryCompositeConfigInput,
  type AgentNetwork,
  type AgentToolsConfigInput,
} from "../src";
import packageJson from "../package.json";

const metadata = { name: packageJson.name, version: packageJson.version };

/** The agent type and its agent-discovery service, as the brain installs them. */
export function agentDiscoveryPlugins(network: AgentNetwork = {}): Plugin[] {
  return instantiatePluginPackageDefinition(
    createAgentDiscoveryPackages(network).agentDiscovery,
    {},
    metadata,
    { pluginId: "agent-discovery", ownedTypePluginId: "agent-entity" },
  );
}

/** The agent tools service, as the brain installs it. */
export function agentToolsPlugins(
  network: AgentNetwork = {},
  config: AgentToolsConfigInput = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    createAgentDiscoveryPackages(network).agentTools,
    config,
    metadata,
    { pluginId: "agent" },
  );
}

/** The skill type and its skill service, with derivation on or off. */
export function skillPlugins(options: { derived?: boolean } = {}): Plugin[] {
  const packages = createAgentDiscoveryPackages();
  return instantiatePluginPackageDefinition(
    options.derived === false ? packages.skill : packages.derivedSkill,
    {},
    metadata,
    { pluginId: "skill", ownedTypePluginId: "skill-entity" },
  );
}

/** The agents capability's plugins, as the canonical brain installs them. */
export function createAgentDiscoveryPlugins(
  config: AgentDiscoveryCompositeConfigInput = {},
  network: AgentNetwork = {},
): Plugin[] {
  const { enableSkillDerivation, notifyOnNewAgents } =
    agentDiscoveryCompositeConfigSchema.parse(config);
  return [
    ...agentDiscoveryPlugins(network),
    ...agentToolsPlugins(network, { notifyOnNewAgents }),
    ...skillPlugins({ derived: enableSkillDerivation }),
  ];
}

/** Install plugins on a test harness in order; the last one's capabilities. */
export async function installAll(
  harness: { installPlugin(plugin: Plugin): Promise<PluginCapabilities> },
  plugins: readonly Plugin[],
): Promise<PluginCapabilities> {
  const installed: PluginCapabilities[] = [];
  for (const plugin of plugins)
    installed.push(await harness.installPlugin(plugin));
  const last = installed.at(-1);
  if (!last) throw new Error("Nothing was installed");
  return last;
}
