import { instantiatePluginPackageDefinition } from "@brains/plugins";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";
import refinedNotePackage from "../src";

/** The entity plugin the refined notes install, as the canonical brain composes them. */
export function refinedNotePlugin(): DeclaredEntityTypePlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    refinedNotePackage,
    {},
    { name: "@brains/refined-note", version: "0.0.0-test" },
    { pluginId: "refined-note" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The refined notes install no entity plugin");
  }
  return plugin;
}
