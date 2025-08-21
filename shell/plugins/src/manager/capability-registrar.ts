import type { Logger } from "@brains/utils";
import type { ServiceRegistry } from "@brains/service-registry";
import type { CommandRegistry } from "@brains/command-registry";
import type { IMCPService } from "@brains/mcp-service";
import type { PluginCapabilities } from "../interfaces";

/**
 * Handles registration of plugin capabilities (commands, tools, resources)
 * Extracted from PluginManager for single responsibility
 */
export class CapabilityRegistrar {
  private logger: Logger;

  constructor(
    private serviceRegistry: ServiceRegistry,
    logger: Logger,
  ) {
    this.logger = logger.child("CapabilityRegistrar");
  }

  /**
   * Register plugin capabilities directly with the appropriate registries
   */
  public async registerCapabilities(
    pluginId: string,
    capabilities: PluginCapabilities,
  ): Promise<void> {
    // Get CommandRegistry and MCPService from service registry
    // Defer resolution until actually needed to avoid initialization order issues
    const commandRegistry =
      this.serviceRegistry.resolve<CommandRegistry>("commandRegistry");
    const mcpService = this.serviceRegistry.resolve<IMCPService>("mcpService");

    // Register commands
    if (capabilities.commands && capabilities.commands.length > 0) {
      let registeredCount = 0;
      for (const command of capabilities.commands) {
        try {
          commandRegistry.registerCommand(pluginId, command);
          registeredCount++;
        } catch (error) {
          this.logger.error(
            `Failed to register command ${command.name} from ${pluginId}:`,
            error,
          );
        }
      }
      if (registeredCount > 0) {
        this.logger.debug(
          `Registered ${registeredCount} commands from ${pluginId}`,
        );
      }
    }

    // Register tools
    if (capabilities.tools && capabilities.tools.length > 0) {
      let registeredCount = 0;
      for (const tool of capabilities.tools) {
        try {
          mcpService.registerTool(pluginId, tool);
          registeredCount++;
        } catch (error) {
          this.logger.error(
            `Failed to register tool ${tool.name} from ${pluginId}:`,
            error,
          );
        }
      }
      if (registeredCount > 0) {
        this.logger.debug(
          `Registered ${registeredCount} tools from ${pluginId}`,
        );
      }
    }

    // Register resources
    if (capabilities.resources && capabilities.resources.length > 0) {
      let registeredCount = 0;
      for (const resource of capabilities.resources) {
        try {
          mcpService.registerResource(pluginId, resource);
          registeredCount++;
        } catch (error) {
          this.logger.error(
            `Failed to register resource ${resource.name} from ${pluginId}:`,
            error,
          );
        }
      }
      if (registeredCount > 0) {
        this.logger.debug(
          `Registered ${registeredCount} resources from ${pluginId}`,
        );
      }
    }
  }
}