import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import decksPackage from "../src";

export type DecksEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the decks install, as the canonical brain composes it. */
export function decksPlugin(): DecksEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    decksPackage,
    {},
    { name: "@brains/decks", version: "0.0.0-test" },
    // Under the id its class had: decks:deck-list, decks:entities.
    { pluginId: "decks" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The decks install no entity plugin");
  }
  return plugin;
}
