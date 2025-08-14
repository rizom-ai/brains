import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IMessageBus } from "@brains/messaging-service";
import type { Logger } from "@brains/utils";
import type { UserPermissionLevel } from "@brains/permission-service";
import type { PluginTool, PluginResource } from "@brains/plugins";
import type { IMCPService } from "./types";
import { shouldRegisterTool, shouldRegisterResource } from "./permissions";

/**
 * MCP Service for managing tool and resource registration
 * Provides the core MCP server instance that interfaces can use
 */
export class MCPService implements IMCPService {
  private static instance: MCPService | null = null;
  private mcpServer: McpServer;
  private logger: Logger;
  private messageBus: IMessageBus;

  // Track registered tools and resources
  private registeredTools = new Map<
    string,
    { pluginId: string; tool: PluginTool }
  >();
  private registeredResources = new Map<
    string,
    { pluginId: string; resource: PluginResource }
  >();

  // Default permission level for the service
  private permissionLevel: UserPermissionLevel = "anchor";

  /**
   * Get the singleton instance of MCPService
   */
  public static getInstance(
    messageBus: IMessageBus,
    logger: Logger,
  ): MCPService {
    MCPService.instance ??= new MCPService(messageBus, logger);
    return MCPService.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    MCPService.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    messageBus: IMessageBus,
    logger: Logger,
  ): MCPService {
    return new MCPService(messageBus, logger);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(messageBus: IMessageBus, logger: Logger) {
    this.messageBus = messageBus;
    this.logger = logger.child("MCPService");

    // Create the MCP server instance
    this.mcpServer = new McpServer({
      name: "brain-mcp",
      version: "1.0.0",
    });

    this.logger.info("MCPService initialized");
  }

  /**
   * Get the MCP server instance for transport layers
   */
  public getMcpServer(): McpServer {
    return this.mcpServer;
  }

  /**
   * Set the permission level for this service
   */
  public setPermissionLevel(level: UserPermissionLevel): void {
    this.permissionLevel = level;
    this.logger.debug(`Permission level set to ${level}`);
  }

  /**
   * Register a tool with the MCP server
   */
  public registerTool(pluginId: string, tool: PluginTool): void {
    const toolVisibility = tool.visibility ?? "anchor";

    // Check permissions
    if (!shouldRegisterTool(this.permissionLevel, toolVisibility)) {
      this.logger.debug(
        `Skipping tool ${tool.name} from ${pluginId} - insufficient permissions`,
      );
      return;
    }

    // Register the tool with MCP server
    this.mcpServer.tool(
      tool.name,
      tool.description,
      tool.inputSchema,
      async (params, extra) => {
        // Extract context from MCP client metadata
        const interfaceId = extra._meta?.["interfaceId"];
        const userId = extra._meta?.["userId"];
        const channelId = extra._meta?.["channelId"];
        const progressToken = extra._meta?.progressToken;

        this.logger.debug("MCP client metadata", {
          tool: tool.name,
          pluginId,
          interfaceId,
          userId,
          channelId,
          progressToken,
        });

        try {
          // Execute tool through message bus using plugin-specific message type
          const response = await this.messageBus.send(
            `plugin:${pluginId}:tool:execute`,
            {
              toolName: tool.name,
              args: params,
              progressToken,
              hasProgress: progressToken !== undefined,
              // Pass through context from MCP client
              interfaceId,
              userId,
              channelId,
            },
            "MCPService",
          );

          if (response && "success" in response && !response.success) {
            throw new Error(
              (response as { error?: string }).error ?? "Tool execution failed",
            );
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(
                  response && "data" in response
                    ? (response as { data: unknown }).data
                    : response,
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          this.logger.error(`Tool execution error for ${tool.name}`, error);
          throw error;
        }
      },
    );

    // Track the tool
    this.registeredTools.set(tool.name, { pluginId, tool });
    this.logger.info(`Registered tool ${tool.name} from ${pluginId}`);
  }

  /**
   * Register a resource with the MCP server
   */
  public registerResource(pluginId: string, resource: PluginResource): void {
    // Resources don't have visibility, default to anchor permission
    const resourceVisibility: UserPermissionLevel = "anchor";

    if (!shouldRegisterResource(this.permissionLevel, resourceVisibility)) {
      this.logger.debug(
        `Skipping resource ${resource.uri} from ${pluginId} - insufficient permissions`,
      );
      return;
    }

    // Register the resource with MCP server
    this.mcpServer.resource(
      resource.uri,
      resource.description ?? `Resource from ${pluginId}`,
      async () => {
        try {
          // Get resource through message bus using plugin-specific message type
          const response = await this.messageBus.send(
            `plugin:${pluginId}:resource:get`,
            {
              resourceUri: resource.uri,
            },
            "MCPService",
          );

          if (response && "success" in response && !response.success) {
            throw new Error(
              (response as { error?: string }).error ?? "Resource fetch failed",
            );
          }

          return {
            contents: [
              {
                uri: resource.uri,
                mimeType: resource.mimeType ?? "text/plain",
                text: JSON.stringify(
                  response && "data" in response
                    ? (response as { data: unknown }).data
                    : response,
                  null,
                  2,
                ),
              },
            ],
          };
        } catch (error) {
          this.logger.error(`Resource fetch error for ${resource.uri}`, error);
          throw error;
        }
      },
    );

    // Track the resource
    this.registeredResources.set(resource.uri, { pluginId, resource });
    this.logger.info(`Registered resource ${resource.uri} from ${pluginId}`);
  }

  /**
   * List all registered tools
   */
  public listTools(): Array<{ pluginId: string; tool: PluginTool }> {
    return Array.from(this.registeredTools.values());
  }

  /**
   * List all registered resources
   */
  public listResources(): Array<{
    pluginId: string;
    resource: PluginResource;
  }> {
    return Array.from(this.registeredResources.values());
  }
}
