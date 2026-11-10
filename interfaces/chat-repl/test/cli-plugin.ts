import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import packageJson from "../package.json";
import cliInterface from "../src";
import type { CLIConfigInput } from "../src/config";

/**
 * The CLI interface as the brain creates it: the package's definition,
 * under the plugin id its class had. The one place the tests name how it is
 * built, so they read the same before and after it was declared.
 */
export function createCliPlugin(config: CLIConfigInput = {}): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    cliInterface,
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "cli" },
  );
  if (!plugin) throw new Error("The CLI definition created no plugin");
  return plugin;
}
