import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import decksPackage from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

/**
 * The deck entity plugin, as the runtime would build it.
 *
 * Tests used to construct DecksPlugin directly; the package now declares
 * the entity, so they go through instantiation instead.
 */
export function deckEntityPlugin(): Plugin {
  bindPluginPackageMetadata(decksPackage, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    decksPackage,
    {},
    PACKAGE_METADATA,
  ).find((candidate) => candidate.type === "entity");
  if (!plugin) throw new Error("Deck entity plugin was not created");
  return plugin;
}
