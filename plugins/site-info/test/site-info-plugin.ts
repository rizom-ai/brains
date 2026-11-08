import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import siteInfoPackage, { type SiteInfoConfigInput } from "../src";

/**
 * Site-info's plugins as the canonical brain composes it: the site-info
 * type's entity plugin under the id its class had, and the service that
 * answers for the site's metadata.
 */
export function siteInfoPlugins(
  // A brain's config arrives unchecked, as brain.yaml gives it.
  config: SiteInfoConfigInput | Record<string, unknown> = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    siteInfoPackage,
    config,
    { name: "@brains/site-info", version: "0.0.0-test" },
    { pluginId: "site-metadata" },
  );
}
