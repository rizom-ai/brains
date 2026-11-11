import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import adminPackage from "../src";

/** The admin service plugin, as the canonical brain composes it. */
export function createAdminPlugin(
  config: Record<string, unknown> = {},
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    adminPackage,
    config,
    { name: "@brains/admin", version: "0.0.0-test" },
    // Under the id its class had.
    { pluginId: "admin" },
  );
  if (!plugin) throw new Error("Admin installs no plugin");
  return plugin;
}
