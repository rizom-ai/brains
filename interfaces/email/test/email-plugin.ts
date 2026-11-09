import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import packageJson from "../package.json";
import {
  createEmailInterface,
  type EmailConfigInput,
  type EmailInterfaceDependencies,
} from "../src";

/**
 * The Email interface as the brain creates it, with the collaborators a test
 * hands it: the package's definition, under the plugin id its class had. The
 * one place the tests name how it is built, so they read the same before
 * and after it was declared.
 */
export function createEmailPlugin(
  config: EmailConfigInput = {},
  dependencies: EmailInterfaceDependencies = {},
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    createEmailInterface(dependencies),
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "email" },
  );
  if (!plugin) throw new Error("The Email definition created no plugin");
  return plugin;
}
