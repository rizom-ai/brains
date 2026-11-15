import { instantiatePluginPackageDefinition } from "@brains/plugins";
import decksPackage from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type DecksEntityPlugin = DeclaredEntityTypePlugin;

/** The entity plugin the decks install, as the canonical brain composes it. */
export function decksPlugin(): DecksEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    decksPackage,
    {},
    { name: "@brains/decks", version: "0.0.0-test" },
    // Under the id its class had: decks:deck-list, decks:entities.
    { pluginId: "decks" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The decks install no entity plugin");
  }
  return plugin;
}
