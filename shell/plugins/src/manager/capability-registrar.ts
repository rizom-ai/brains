import type { Logger } from "@brains/utils";
import type { IShell } from "@brains/plugins";
import type { PluginCapabilities } from "../interfaces";

/**
 * Handles registration of plugin capabilities (commands, tools, resources)
 * Extracted from PluginManager for single responsibility
 */
export class CapabilityRegistrar {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child("CapabilityRegistrar");
  }

  /**
   * Register plugin capabilities using Shell convenience methods
   */
  public async registerCapabilities(
    shell: IShell,
    pluginId: string,
    capabilities: PluginCapabilities,
  ): Promise<void> {
    // Register commands
    if (capabilities.commands.length > 0) {
      shell.registerPluginCommands(pluginId, capabilities.commands);
      this.logger.debug(
        `Registered ${capabilities.commands.length} commands from ${pluginId}`,
      );
    }

    // Register tools
    if (capabilities.tools.length > 0) {
      shell.registerPluginTools(pluginId, capabilities.tools);
      this.logger.debug(
        `Registered ${capabilities.tools.length} tools from ${pluginId}`,
      );
    }

    // Register resources
    if (capabilities.resources.length > 0) {
      shell.registerPluginResources(pluginId, capabilities.resources);
      this.logger.debug(
        `Registered ${capabilities.resources.length} resources from ${pluginId}`,
      );
    }
  }
}
