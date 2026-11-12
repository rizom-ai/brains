import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import docsPackage, { type DocsConfigInput } from "../src";

export type DocsEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the docs install, as the canonical brain composes it. */
export function docsPlugin(config: DocsConfigInput = {}): DocsEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    docsPackage,
    config,
    { name: "@brains/doc", version: "0.0.0-test" },
    // Under the id its class had: docs:doc-list, docs:entities.
    { pluginId: "docs" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The docs install no entity plugin");
  }
  return plugin;
}
