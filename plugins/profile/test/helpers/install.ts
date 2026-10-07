import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import profilePackage from "../../src";
import type { ProfileConfigInput } from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

/**
 * The profile service, as the runtime would build it.
 *
 * Tests used to construct ProfilePlugin directly; the package declares
 * itself now, so they go through instantiation instead.
 */
export function profilePlugin(config: ProfileConfigInput = {}): Plugin {
  bindPluginPackageMetadata(profilePackage, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    profilePackage,
    config,
    PACKAGE_METADATA,
  )[0];
  if (!plugin) throw new Error("Profile plugin was not created");
  return plugin;
}
