import type { Plugin } from "@brains/plugins";
import { topicsPlugin, type TopicsPluginConfigInput } from "../src";

/** The topics package's plugins, as the canonical brain installs them. */
export function createTopicsPlugins(
  config: TopicsPluginConfigInput = {},
): Plugin[] {
  return [topicsPlugin(config)];
}
