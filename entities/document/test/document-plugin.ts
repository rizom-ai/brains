import { instantiatePluginPackageDefinition } from "@brains/plugins";
import documentPackage, {
  createDocumentPackage,
  type DocumentGenerationHandlerDeps,
} from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type DocumentEntityPlugin = DeclaredEntityTypePlugin;

/**
 * The entity plugin the documents install, as the canonical brain composes
 * it, with the job's PDF renderer when a test gives one.
 */
export function documentPlugin(
  deps?: DocumentGenerationHandlerDeps,
): DocumentEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    deps ? createDocumentPackage(deps) : documentPackage,
    {},
    { name: "@brains/document-plugin", version: "0.0.0-test" },
    // Under the id its class had: document:generate.
    { pluginId: "document" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The documents install no entity plugin");
  }
  return plugin;
}
