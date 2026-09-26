import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
  type PluginCapabilities,
  type WebRouteDefinition,
} from "@brains/plugins";
import type { PluginTestHarness } from "@brains/plugins/test";
import {
  dashboardService,
  DashboardWidgetRegistry,
  type DashboardConfigInput,
} from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};
export const DASHBOARD_PLUGIN_ID: string = `${packageJson.name}:dashboard`;

/** The dashboard as the runtime builds it from one configuration. */
export function instantiate(
  config: DashboardConfigInput = {},
  widgets?: DashboardWidgetRegistry,
): Plugin {
  const definition = dashboardService(widgets ? { widgets } : {});
  bindPluginPackageMetadata(definition, PACKAGE_METADATA);
  const [plugin] = instantiatePluginPackageDefinition(
    definition,
    config,
    PACKAGE_METADATA,
  );
  if (!plugin) throw new Error("Dashboard plugin was not created");
  return plugin;
}

export interface InstalledDashboard {
  readonly plugin: Plugin;
  readonly capabilities: PluginCapabilities;
  /** The registry the service holds, so a test can read what registered. */
  readonly widgets: DashboardWidgetRegistry;
  routes(): WebRouteDefinition[];
  route(path: string): WebRouteDefinition;
}

export async function installDashboard(
  harness: PluginTestHarness<Plugin>,
  config: DashboardConfigInput = {},
): Promise<InstalledDashboard> {
  const widgets = new DashboardWidgetRegistry(
    harness.getMockShell().getLogger(),
  );
  const plugin = instantiate(config, widgets);
  const capabilities = await harness.installPlugin(plugin);
  const routes = (): WebRouteDefinition[] => plugin.getWebRoutes?.() ?? [];
  return {
    plugin,
    capabilities,
    widgets,
    routes,
    route: (path): WebRouteDefinition => {
      const found = routes().find((candidate) => candidate.path === path);
      if (!found) throw new Error(`Expected a dashboard route at ${path}`);
      return found;
    },
  };
}

/** A stand-in console, so the strip has a door to offer. */
export function mountConsole(
  harness: PluginTestHarness<Plugin>,
  pluginId: string,
  path: string,
): void {
  harness.getMockShell().addPlugin({
    id: pluginId,
    version: "1.0.0",
    type: "interface",
    packageName: pluginId,
    register: async () => ({ tools: [], resources: [] }),
    getWebRoutes: () => [
      {
        path,
        method: "GET",
        public: true,
        handler: (): Response => new Response("ok"),
      },
    ],
  });
}
