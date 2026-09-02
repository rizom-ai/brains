import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import unifiedInboxPackage from "../src";
import packageJson from "../package.json";

/**
 * The package as the runtime instantiates it.
 *
 * The tests used to construct the plugin class directly; the declaration is
 * not a class, so they go through the same path the runtime does — which is
 * also what scopes the ids they assert on.
 */
export function createUnifiedInboxPlugin(): Plugin {
  const metadata = { name: packageJson.name, version: packageJson.version };
  bindPluginPackageMetadata(unifiedInboxPackage, metadata);
  const plugin = instantiatePluginPackageDefinition(
    unifiedInboxPackage,
    {},
    metadata,
  )[0];
  if (!plugin) throw new Error("Unified inbox plugin was not created");
  return plugin;
}
