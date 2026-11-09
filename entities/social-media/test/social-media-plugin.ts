import {
  EntityPlugin,
  instantiatePluginPackageDefinition,
  type BaseEntity,
} from "@brains/plugins";
import socialMediaPackage, { type SocialMediaConfigInput } from "../src";

export type SocialMediaEntityPlugin = EntityPlugin<
  BaseEntity,
  Record<string, never>,
  Record<string, never>
>;

/** The entity plugin the social media package installs, as the canonical brain composes it. */
export function socialMediaPlugin(
  config: SocialMediaConfigInput = {},
): SocialMediaEntityPlugin {
  const [plugin] = instantiatePluginPackageDefinition(
    socialMediaPackage,
    config,
    { name: "@brains/social-media", version: "0.0.0-test" },
    // Under the id its class had: social-media:linkedin, social-media:posts.
    { pluginId: "social-media" },
  );
  if (!(plugin instanceof EntityPlugin)) {
    throw new Error("The social media package installs no entity plugin");
  }
  return plugin;
}
