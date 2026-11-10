import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import notePackage from "../src";

export type NoteEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the notes install, as the canonical brain composes them. */
export function notePlugin(): NoteEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    notePackage,
    {},
    { name: "@brains/note", version: "0.0.0-test" },
    // Under the id its class had: note:generation, note:upload-import.
    { pluginId: "note" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The notes install no entity plugin");
  }
  return plugin;
}
