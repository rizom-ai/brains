import type { Plugin } from "@brains/plugins";
import { StockPhotoPlugin, type StockPhotoDeps } from "../src/plugin";

/** The stock-photo package's plugin, as a brain installs it. */
export function createStockPhotoPlugin(
  config: { apiKey?: string } = {},
  deps: StockPhotoDeps = {},
): Plugin {
  return new StockPhotoPlugin(config, deps);
}
