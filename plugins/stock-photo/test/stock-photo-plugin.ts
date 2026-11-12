import {
  instantiatePluginPackageDefinition,
  type Plugin,
} from "@brains/plugins";
import { createStockPhotoPackage, type StockPhotoDeps } from "../src/plugin";
import packageJson from "../package.json";

/**
 * The stock-photo package's plugin, as the canonical brain installs it:
 * under its class's plugin id.
 */
export function createStockPhotoPlugin(
  config: { apiKey?: string } = {},
  deps: StockPhotoDeps = {},
): Plugin {
  const [plugin] = instantiatePluginPackageDefinition(
    createStockPhotoPackage(deps),
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "stock-photo" },
  );
  if (!plugin) throw new Error("The stock-photo package created no plugin");
  return plugin;
}
