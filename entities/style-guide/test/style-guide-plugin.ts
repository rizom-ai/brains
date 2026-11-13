import { instantiatePluginPackageDefinition } from "@brains/plugins";
import styleGuidePackage from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type StyleGuideEntityPlugin = DeclaredEntityTypePlugin;

/** The entity plugin the style-guide package installs, as a brain composes it. */
export function styleGuidePlugin(): StyleGuideEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    styleGuidePackage,
    {},
    { name: "@brains/style-guide", version: "0.0.0-test" },
    // As the canonical brain composes it: under the id its class had.
    { pluginId: "style-guide" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The style-guide package installs no entity plugin");
  }
  return plugin;
}
