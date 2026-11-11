import type { Plugin } from "@brains/plugins";
import { DirectorySyncPlugin } from "../src/plugin";
import type { DirectorySyncConfigInput } from "../src/types";

/** The directory-sync package's plugins, as a brain installs them. */
export function createDirectorySyncPlugins(
  config: DirectorySyncConfigInput = {},
): Plugin[] {
  return [new DirectorySyncPlugin(config)];
}
