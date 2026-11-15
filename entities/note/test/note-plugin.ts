import { instantiatePluginPackageDefinition } from "@brains/plugins";
import notePackage from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type NoteEntityPlugin = DeclaredEntityTypePlugin;

/** The entity plugin the notes install, as the canonical brain composes them. */
export function notePlugin(): NoteEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    notePackage,
    {},
    { name: "@brains/note", version: "0.0.0-test" },
    // Under the id its class had: note:generation, note:upload-import.
    { pluginId: "note" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The notes install no entity plugin");
  }
  return plugin;
}
