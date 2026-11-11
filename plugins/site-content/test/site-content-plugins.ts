import type { Plugin } from "@brains/plugins";
import { SiteContentPlugin } from "../src/plugin";
import type { SiteContentPluginConfigInput } from "../src/schemas/config";

/** The site-content package's plugins, as a brain installs them. */
export function createSiteContentPlugins(
  config: SiteContentPluginConfigInput = {},
): Plugin[] {
  return [new SiteContentPlugin(config)];
}
