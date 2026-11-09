import type { Plugin } from "@brains/plugins";
import { SocialMediaPlugin, type SocialMediaConfigInput } from "../src";

/** The plugin the social media package installs, as the canonical brain composes it. */
export function socialMediaPlugin(config: SocialMediaConfigInput = {}): Plugin {
  return new SocialMediaPlugin(config);
}
