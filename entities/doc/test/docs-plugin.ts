import { instantiatePluginPackageDefinition } from "@brains/plugins";
import docsPackage, { type DocsConfigInput } from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type DocsEntityPlugin = DeclaredEntityTypePlugin;

/** The entity plugin the docs install, as the canonical brain composes it. */
export function docsPlugin(config: DocsConfigInput = {}): DocsEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    docsPackage,
    config,
    { name: "@brains/doc", version: "0.0.0-test" },
    // Under the id its class had: docs:doc-list, docs:entities.
    { pluginId: "docs" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The docs install no entity plugin");
  }
  return plugin;
}
