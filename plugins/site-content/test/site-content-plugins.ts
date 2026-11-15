import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { createSiteContentPackage } from "../src/plugin";
import type { SiteContentPluginConfigInput } from "../src/schemas/config";

/**
 * The site-content type's plugin and the site-content service, as the
 * canonical brain composes the package, in the order they register.
 */
export function createSiteContentPlugins(
  config: SiteContentPluginConfigInput = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    createSiteContentPackage(),
    config,
    { name: "@brains/site-content", version: "0.0.0-test" },
    // Under the id its class had; its type installs apart.
    { pluginId: "site-content", ownedTypePluginId: "site-content-entity" },
  );
}
