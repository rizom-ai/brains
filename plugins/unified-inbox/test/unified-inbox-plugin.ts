import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import unifiedInboxPackage from "../src";

/** The unified inbox service plugin, as the canonical brain composes it. */
export function createUnifiedInboxPlugin(): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    unifiedInboxPackage,
    {},
    { name: "@brains/unified-inbox", version: "0.0.0-test" },
    // Under the id its class had.
    { pluginId: "unified-inbox" },
  );
  if (!plugin) throw new Error("The unified inbox installs no plugin");
  return plugin;
}
