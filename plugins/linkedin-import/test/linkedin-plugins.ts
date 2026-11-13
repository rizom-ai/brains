import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { createLinkedInImportPackage, type LinkedInImportDeps } from "../src";
import packageJson from "../package.json";

/**
 * The LinkedIn import's plugins, as the canonical brain installs them:
 * under the class's plugin id, the sender profile admits.
 */
export function createLinkedInImportPlugins(
  config: Record<string, unknown> = {},
  deps: LinkedInImportDeps = {},
): Plugin[] {
  return instantiatePluginPackageDefinition(
    createLinkedInImportPackage(deps),
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "linkedin-import" },
  );
}
