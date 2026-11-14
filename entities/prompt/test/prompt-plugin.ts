import { instantiatePluginPackageDefinition } from "@brains/plugins";
import promptPackage from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type PromptEntityPlugin = DeclaredEntityTypePlugin;

/** The entity plugin the prompt package installs, as a brain composes it. */
export function promptPlugin(): PromptEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    promptPackage,
    {},
    { name: "@brains/prompt", version: "0.0.0-test" },
    // As the canonical brain composes it: under the id its class had.
    { pluginId: "prompt" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The prompt package installs no entity plugin");
  }
  return plugin;
}
