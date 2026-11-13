import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { createOAuthBrokerPackage, type OAuthBrokerDeps } from "../src";
import packageJson from "../package.json";

/**
 * The broker's plugins, as the canonical brain installs them: under the
 * broker class's plugin id.
 */
export function createOAuthBrokerPlugins(
  config: Record<string, unknown>,
  deps: OAuthBrokerDeps,
): Plugin[] {
  return instantiatePluginPackageDefinition(
    createOAuthBrokerPackage(deps),
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "oauth-broker" },
  );
}

/** The broker installed on a test shell, as a brain registers it. */
export async function installBroker(
  config: Record<string, unknown>,
  deps: OAuthBrokerDeps,
  shell: MockShell = createMockShell(),
): Promise<{ shell: MockShell; plugins: Plugin[] }> {
  const plugins = createOAuthBrokerPlugins(config, deps);
  for (const plugin of plugins) await plugin.register(shell);
  return { shell, plugins };
}

/** The web routes the broker's plugins serve. */
export function brokerRoutes(plugins: Plugin[]): WebRouteDefinition[] {
  return plugins.flatMap((plugin) => plugin.getWebRoutes?.() ?? []);
}
