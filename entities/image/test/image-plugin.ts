import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import imagePackage from "../src";

export type ImageEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the images install, as the canonical brain composes it. */
export function imagePlugin(
  config: Record<string, unknown> = {},
): ImageEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    imagePackage,
    config,
    { name: "@brains/image-plugin", version: "0.0.0-test" },
    // Under the id its class had: image:image-generate, image:upload-promote.
    { pluginId: "image" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The images install no entity plugin");
  }
  return plugin;
}
