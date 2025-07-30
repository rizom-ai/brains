import { InterfacePluginTestHarness } from "@brains/interface-plugin";
import type { Plugin } from "@brains/plugin-base";

/**
 * Test harness for message interface plugins
 * Extends InterfacePluginTestHarness to properly type the plugin
 */
export class MessageInterfacePluginTestHarness<
  TPlugin extends Plugin = Plugin,
> extends InterfacePluginTestHarness<TPlugin> {
  /**
   * Get the plugin's session ID
   */
  getSessionId(): string {
    const plugin = this.getPlugin();
    if ("sessionId" in plugin && typeof plugin.sessionId === "string") {
      return plugin.sessionId;
    }
    throw new Error("Plugin does not have a sessionId property");
  }
}
