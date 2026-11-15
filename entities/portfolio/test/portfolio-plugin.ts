import { instantiatePluginPackageDefinition } from "@brains/plugins";
import portfolioPackage from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type PortfolioEntityPlugin = DeclaredEntityTypePlugin;

/** The entity plugin the portfolio installs, as the canonical brain composes it. */
export function portfolioPlugin(): PortfolioEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    portfolioPackage,
    {},
    { name: "@brains/portfolio", version: "0.0.0-test" },
    // Under the id its class had: portfolio:generation, project:generation.
    { pluginId: "portfolio" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The portfolio installs no entity plugin");
  }
  return plugin;
}
