import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import blogPackage from "../src";

export type BlogEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the blog installs, as the canonical brain composes it. */
export function blogPlugin(): BlogEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    blogPackage,
    {},
    { name: "@brains/blog", version: "0.0.0-test" },
    // Under the id its class had: blog:entities, post:generation.
    { pluginId: "blog" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The blog installs no entity plugin");
  }
  return plugin;
}
