import type { Plugin, WebRouteDefinition } from "@brains/plugins";
import { createMockShell, type MockShell } from "@brains/plugins/test";
import { oauthBrokerPlugin, type OAuthBrokerDeps } from "../src";

/** The broker's plugins, as the canonical brain installs them. */
export function createOAuthBrokerPlugins(
  config: Record<string, unknown>,
  deps: OAuthBrokerDeps,
): Plugin[] {
  return [oauthBrokerPlugin(config, deps)];
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
