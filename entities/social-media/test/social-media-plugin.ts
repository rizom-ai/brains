import { instantiatePluginPackageDefinition } from "@brains/plugins";
import socialMediaPackage, { type SocialMediaConfigInput } from "../src";
import {
  isDeclaredEntityType,
  type DeclaredEntityTypePlugin,
} from "@brains/plugins/test";

export type SocialMediaEntityPlugin = DeclaredEntityTypePlugin;

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
  if (!isDeclaredEntityType(plugin)) {
    throw new Error("The social media package installs no entity plugin");
  }
  return plugin;
}
