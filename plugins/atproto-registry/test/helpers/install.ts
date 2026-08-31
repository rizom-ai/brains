import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import atprotoRegistryPackage from "../../src";
import type { AtprotoRegistryConfigInput } from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

/**
 * The registry, as the runtime would build it.
 *
 * Tests used to construct AtprotoRegistryPlugin directly; the package
 * declares itself now, so they go through instantiation instead.
 */
export function atprotoRegistryPlugin(
  config: AtprotoRegistryConfigInput = {},
): Plugin {
  bindPluginPackageMetadata(atprotoRegistryPackage, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    atprotoRegistryPackage,
    config,
    PACKAGE_METADATA,
  )[0];
  if (!plugin) throw new Error("Registry plugin was not created");
  return plugin;
}
