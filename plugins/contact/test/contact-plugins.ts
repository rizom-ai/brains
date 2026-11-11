import type { Plugin } from "@brains/plugins";
import { contactPlugin } from "../src";
import type { ContactPluginConfig } from "../src/config";

/** The contact package's plugins, as a brain installs them. */
export function createContactPlugins(
  config: ContactPluginConfig = {},
): Plugin[] {
  return contactPlugin(config);
}
