import {
  bindPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import portfolioPackage from "../../src";
import packageJson from "../../package.json";

export const PACKAGE_METADATA: { name: string; version: string } = {
  name: packageJson.name,
  version: packageJson.version,
};

/**
 * The project entity plugin, as the runtime would build it.
 *
 * Tests used to construct PortfolioPlugin directly; the package now
 * declares the entity, so they go through instantiation instead.
 */
export function projectEntityPlugin(): Plugin {
  bindPluginPackageMetadata(portfolioPackage, PACKAGE_METADATA);
  const plugin = instantiatePluginPackageDefinition(
    portfolioPackage,
    {},
    PACKAGE_METADATA,
  ).find((candidate) => candidate.type === "entity");
  if (!plugin) throw new Error("Project entity plugin was not created");
  return plugin;
}
