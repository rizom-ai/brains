import { instantiatePluginPackageDefinition } from "@brains/plugins";
import imagePackage from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type ImageEntityPlugin = DeclaredEntityTypePlugin;

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
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The images install no entity plugin");
  }
  return plugin;
}
