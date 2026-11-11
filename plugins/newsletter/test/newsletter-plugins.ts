import type { Plugin } from "@brains/plugins";
import { newsletter, type NewsletterCompositeConfigInput } from "../src";

/** The newsletter package's plugins, as a brain installs them. */
export function createNewsletterPlugins(
  config: NewsletterCompositeConfigInput = {},
): Plugin[] {
  return newsletter(config);
}
