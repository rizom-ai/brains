import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { formPackage } from "../src";
import packageJson from "../package.json";

/**
 * The form package's plugins, as the canonical brain installs them: under
 * the form class's plugin id.
 */
export function createFormPlugins(): Plugin[] {
  return instantiatePluginPackageDefinition(
    formPackage,
    {},
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "form" },
  );
}
