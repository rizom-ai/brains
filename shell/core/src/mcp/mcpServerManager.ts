import type { Logger } from "@brains/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerShellMCP } from "./index";
import type { ContentGenerator } from "@brains/content-generator";
import type { EntityService } from "@brains/entity-service";
import type { PluginManager } from "../plugins/pluginManager";
import { PluginEvent } from "../plugins/pluginManager";
import type {
  PluginToolRegisterEvent,
  PluginResourceRegisterEvent,
} from "../types/plugin-manager";
import {
  McpError,
  ToolRegistrationError,
  ResourceRegistrationError,
} from "@brains/utils";

/**
 * Manages MCP server setup and plugin tool/resource registration
 * Extracted from Shell to improve separation of concerns
 */
export class McpServerManager {
  private static instance: McpServerManager | null = null;

  private logger: Logger;
  private mcpServer: McpServer;

  /**
   * Get the singleton instance of McpServerManager
   */
  public static getInstance(
    logger: Logger,
    mcpServer: McpServer,
  ): McpServerManager {
    McpServerManager.instance ??= new McpServerManager(logger, mcpServer);
    return McpServerManager.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    McpServerManager.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    logger: Logger,
    mcpServer: McpServer,
  ): McpServerManager {
    return new McpServerManager(logger, mcpServer);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger, mcpServer: McpServer) {
    this.logger = logger.child("McpServerManager");
    this.mcpServer = mcpServer;
  }

  /**
   * Initialize MCP server with shell capabilities
   */
  public initializeShellCapabilities(
    contentGenerator: ContentGenerator,
    entityService: EntityService,
  ): void {
    this.logger.debug("Initializing Shell MCP capabilities");

    try {
      // Register shell MCP capabilities
      registerShellMCP(this.mcpServer, {
        contentGenerator,
        entityService,
        logger: this.logger,
      });

      this.logger.debug("Shell MCP capabilities registered successfully");
    } catch (error) {
      this.logger.error("Failed to register Shell MCP capabilities", error);
      throw new McpError("Shell MCP registration", error);
    }
  }

  /**
   * Set up plugin event listeners for tool and resource registration
   */
  public setupPluginEventListeners(pluginManager: PluginManager): void {
    this.logger.debug("Setting up plugin event listeners");

    // Listen for plugin tool registration events
    pluginManager.on(PluginEvent.TOOL_REGISTER, (event) => {
      this.handleToolRegistration(event);
    });

    // Listen for plugin resource registration events
    pluginManager.on(PluginEvent.RESOURCE_REGISTER, (event) => {
      this.handleResourceRegistration(event);
    });

    this.logger.debug("Plugin event listeners configured");
  }

  /**
   * Handle plugin tool registration
   */
  private handleToolRegistration(event: PluginToolRegisterEvent): void {
    const { pluginId, tool } = event;
    this.logger.debug(
      `Registering MCP tool from plugin ${pluginId}: ${tool.name}`,
    );

    try {
      // Register the tool with the MCP server
      this.mcpServer.tool(
        tool.name,
        tool.description,
        tool.inputSchema,
        async (params, extra) => {
          try {
            // Create progress context if a progress token is provided
            let progressContext;
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            if (extra?._meta?.progressToken) {
              const progressToken = extra._meta.progressToken;
              progressContext = {
                progressToken,
                sendProgress: async (notification: {
                  progress: number;
                  total?: number;
                  message?: string;
                }): Promise<void> => {
                  await extra.sendNotification({
                    method: "notifications/progress" as const,
                    params: {
                      progressToken,
                      progress: notification.progress,
                      total: notification.total,
                      message: notification.message,
                    },
                  });
                },
              };
            }

            const result = await tool.handler(params, progressContext);
            return {
              content: [
                {
                  type: "text" as const,
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          } catch (error) {
            this.logger.error(`Error in tool ${tool.name}`, error);
            throw error;
          }
        },
      );

      this.logger.debug(`Successfully registered tool: ${tool.name}`);
    } catch (error) {
      this.logger.error(
        `Failed to register tool ${tool.name} from plugin ${pluginId}`,
        error,
      );
      throw new ToolRegistrationError(tool.name, error, pluginId);
    }
  }

  /**
   * Handle plugin resource registration
   */
  private handleResourceRegistration(event: PluginResourceRegisterEvent): void {
    const { pluginId, resource } = event;
    this.logger.debug(
      `Registering MCP resource from plugin ${pluginId}: ${resource.uri}`,
    );

    try {
      // Register the resource with the MCP server
      this.mcpServer.resource(resource.name, resource.uri, async () => {
        const result = await resource.handler();
        return result;
      });

      this.logger.debug(`Successfully registered resource: ${resource.name}`);
    } catch (error) {
      this.logger.error(
        `Failed to register resource ${resource.name} from plugin ${pluginId}`,
        error,
      );
      throw new ResourceRegistrationError(resource.name, error, pluginId);
    }
  }

  /**
   * Get the MCP server instance
   */
  public getMcpServer(): McpServer {
    return this.mcpServer;
  }
}
