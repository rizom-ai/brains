import type { Plugin } from "@brains/plugins";
import { guidesPlugin } from "../src";

/** The guide package's plugins, as the canonical brain installs them. */
export function createGuidePlugins(
  config: Record<string, unknown> = {},
): Plugin[] {
  return [guidesPlugin(config)];
}
