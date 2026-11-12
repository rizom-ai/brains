import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import linkPackage from "../src";

export type LinkEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the links install, as the canonical brain composes it. */
export function linkPlugin(): LinkEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    linkPackage,
    {},
    { name: "@brains/link", version: "0.0.0-test" },
    // Under the id its class had: link:capture, link:generation.
    { pluginId: "link" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The links install no entity plugin");
  }
  return plugin;
}
