import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import blogPackage from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

/**
 * The post entity plugin, as the runtime would build it.
 *
 * Tests used to construct BlogPlugin directly; the package now declares the
 * entity, so they go through instantiation instead.
 */
export function postEntityPlugin(): Plugin {
  bindPluginPackageMetadata(blogPackage, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    blogPackage,
    {},
    PACKAGE_METADATA,
  ).find((candidate) => candidate.type === "entity");
  if (!plugin) throw new Error("Post entity plugin was not created");
  return plugin;
}
