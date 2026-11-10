import type { Plugin } from "@brains/plugins";
import { SiteBuilderPlugin } from "../src/plugin";
import type { SiteBuilderConfigInput } from "../src/config";

/** The site-builder package's plugin, as a brain installs it. */
export function createSiteBuilderPlugin(
  config: SiteBuilderConfigInput = {},
): Plugin {
  return new SiteBuilderPlugin(config);
}
