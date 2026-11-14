import { instantiatePluginPackageDefinition } from "@brains/plugins";
import linkPackage from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type LinkEntityPlugin = DeclaredEntityTypePlugin;

/** The entity plugin the links install, as the canonical brain composes it. */
export function linkPlugin(): LinkEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    linkPackage,
    {},
    { name: "@brains/link", version: "0.0.0-test" },
    // Under the id its class had: link:capture, link:generation.
    { pluginId: "link" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The links install no entity plugin");
  }
  return plugin;
}
