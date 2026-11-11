import type { Plugin } from "@brains/plugins";
import { studioPlugin } from "../src";

/** The Studio package's plugins, as a brain installs them. */
export function createStudioPlugins(
  config: Parameters<typeof studioPlugin>[0] = {},
): Plugin[] {
  return [studioPlugin(config)];
}
