import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type WebRouteDefinition,
} from "@brains/plugins";
import {
  createDashboardPackage,
  type DashboardConfigInput,
  type DashboardState,
} from "../src/plugin";
import type { DashboardWidgetRegistry } from "../src/widget-registry";
import packageJson from "../package.json";

const metadata = { name: packageJson.name, version: packageJson.version };

/**
 * The Dashboard service as a test drives it: the plugin the canonical brain
 * composes, its routes, and the widget registry its class exposed
 * (`getWidgetRegistry`).
 */
export type DashboardPlugin = Plugin & {
  getWebRoutes(): WebRouteDefinition[];
  getWidgetRegistry(): DashboardWidgetRegistry | null;
};

/** The Dashboard service, as the canonical brain composes it. */
export function dashboardPlugin(
  config: DashboardConfigInput = {},
): DashboardPlugin {
  const held: { state?: DashboardState } = {};
  const [plugin] = instantiatePluginPackageDefinition(
    createDashboardPackage({
      onSetup: (state): void => {
        held.state = state;
      },
    }),
    config,
    metadata,
    { pluginId: "dashboard" },
  );
  if (!plugin?.getWebRoutes)
    throw new Error("The package installs no Dashboard service");
  const { getWebRoutes } = plugin;
  return Object.assign(plugin, {
    getWebRoutes: (): WebRouteDefinition[] => getWebRoutes.call(plugin),
    getWidgetRegistry: (): DashboardWidgetRegistry | null =>
      held.state?.widgetRegistry ?? null,
  });
}

/** The Dashboard package's plugins, as a brain installs them. */
export function createDashboardPlugins(
  config: DashboardConfigInput = {},
): Plugin[] {
  return [dashboardPlugin(config)];
}
