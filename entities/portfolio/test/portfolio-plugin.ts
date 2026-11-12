import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import portfolioPackage from "../src";

export type PortfolioEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the portfolio installs, as the canonical brain composes it. */
export function portfolioPlugin(): PortfolioEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    portfolioPackage,
    {},
    { name: "@brains/portfolio", version: "0.0.0-test" },
    // Under the id its class had: portfolio:generation, project:generation.
    { pluginId: "portfolio" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The portfolio installs no entity plugin");
  }
  return plugin;
}
