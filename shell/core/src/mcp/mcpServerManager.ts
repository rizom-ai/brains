import type { Logger, UserPermissionLevel } from "@brains/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerShellMCP } from "./index";
import type { ShellMCPCapabilities } from "./index";
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
  private serverPermissionLevel: UserPermissionLevel;

  /**
   * Get the singleton instance of McpServerManager
   */
  public static getInstance(
    logger: Logger,
    mcpServer: McpServer,
    serverPermissionLevel: UserPermissionLevel = "public",
  ): McpServerManager {
    McpServerManager.instance ??= new McpServerManager(logger, mcpServer, serverPermissionLevel);
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
    serverPermissionLevel: UserPermissionLevel = "public",
  ): McpServerManager {
    return new McpServerManager(logger, mcpServer, serverPermissionLevel);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(logger: Logger, mcpServer: McpServer, serverPermissionLevel: UserPermissionLevel = "public") {
    this.logger = logger.child("McpServerManager");
    this.mcpServer = mcpServer;
    this.serverPermissionLevel = serverPermissionLevel;
    
    this.logger.debug(`MCP server initialized with permission level: ${serverPermissionLevel}`);
  }

  /**
   * Initialize MCP server with shell capabilities
   */
  public initializeShellCapabilities(capabilities: ShellMCPCapabilities): void {
    this.logger.debug("Initializing Shell MCP capabilities");

    try {
      // Register shell MCP capabilities
      registerShellMCP(this.mcpServer, {
        ...capabilities,
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
    
    // Filter tools based on server permission level
    const toolVisibility = tool.visibility || "anchor"; // Default to anchor for safety
    const shouldRegisterTool = this.shouldRegisterTool(toolVisibility);
    
    if (!shouldRegisterTool) {
      this.logger.debug(
        `Skipping tool registration due to permission level - plugin: ${pluginId}, tool: ${tool.name}, visibility: ${toolVisibility}, server level: ${this.serverPermissionLevel}`,
      );
      return;
    }

    this.logger.debug(
      `Registering MCP tool from plugin ${pluginId}: ${tool.name} (visibility: ${toolVisibility})`,
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
   * Determine if a tool should be registered based on server permission level and tool visibility
   */
  private shouldRegisterTool(toolVisibility: UserPermissionLevel): boolean {
    // Anchor servers get all tools
    if (this.serverPermissionLevel === "anchor") {
      return true;
    }

    // Trusted servers get trusted + public tools
    if (this.serverPermissionLevel === "trusted") {
      return toolVisibility === "public" || toolVisibility === "trusted";
    }

    // Public servers get only public tools
    return toolVisibility === "public";
  }

  /**
   * Get the current server permission level
   */
  public getServerPermissionLevel(): UserPermissionLevel {
    return this.serverPermissionLevel;
  }

  /**
   * Get the MCP server instance
   */
  public getMcpServer(): McpServer {
    return this.mcpServer;
  }
}
