import type { Plugin } from "@brains/plugins";
import { dashboardPlugin, type DashboardConfigInput } from "../src/plugin";

/** The Dashboard package's plugins, as a brain installs them. */
export function createDashboardPlugins(
  config: DashboardConfigInput = {},
): Plugin[] {
  return [dashboardPlugin(config)];
}
