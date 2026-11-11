import type { Plugin } from "@brains/plugins";
import { AtprotoPlugin, type AtprotoPluginDeps } from "../src/plugin";
import type { AtprotoConfigInput } from "../src/config";

/** The atproto package's plugins, as a brain installs them. */
export function createAtprotoPlugins(
  config: AtprotoConfigInput = {},
  deps: AtprotoPluginDeps = {},
): Plugin[] {
  return [new AtprotoPlugin(config, deps)];
}
