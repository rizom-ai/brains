import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import documentPackage, {
  createDocumentPackage,
  type DocumentGenerationHandlerDeps,
} from "../src";

export type DocumentEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

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
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The documents install no entity plugin");
  }
  return plugin;
}
