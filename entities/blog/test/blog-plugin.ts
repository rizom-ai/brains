import { instantiatePluginPackageDefinition } from "@brains/plugins";
import blogPackage from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type BlogEntityPlugin = DeclaredEntityTypePlugin;

/** The entity plugin the blog installs, as the canonical brain composes it. */
export function blogPlugin(): BlogEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    blogPackage,
    {},
    { name: "@brains/blog", version: "0.0.0-test" },
    // Under the id its class had: blog:entities, post:generation.
    { pluginId: "blog" },
  );
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The blog installs no entity plugin");
  }
  return plugin;
}
