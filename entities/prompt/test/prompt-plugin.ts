import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import promptPackage from "../src";

export type PromptEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the prompt package installs, as a brain composes it. */
export function promptPlugin(): PromptEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    promptPackage,
    {},
    { name: "@brains/prompt", version: "0.0.0-test" },
    // As the canonical brain composes it: under the id its class had.
    { pluginId: "prompt" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The prompt package installs no entity plugin");
  }
  return plugin;
}
