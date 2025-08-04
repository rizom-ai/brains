import type {
  InterfacePluginContext,
  PluginTool,
  PluginResource,
  UserPermissionLevel,
  Logger,
} from "@brains/plugins";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { shouldRegisterTool, shouldRegisterResource } from "../utils/permissions";

/**
 * Set up listeners for system events (tool and resource registration)
 */
export function setupSystemEventListeners(
  context: InterfacePluginContext,
  mcpServer: McpServer | undefined,
  getPermissionLevel: () => UserPermissionLevel,
  logger: Logger,
): void {
  // Subscribe to tool registration events
  context.subscribe("system:tool:register", (message) => {
    const { pluginId, tool } = message.payload as {
      pluginId: string;
      tool: PluginTool;
      timestamp: number;
    };
    handleToolRegistration(pluginId, tool, mcpServer, context, getPermissionLevel(), logger);
    return { success: true };
  });

  // Subscribe to resource registration events
  context.subscribe("system:resource:register", (message) => {
    const { pluginId, resource } = message.payload as {
      pluginId: string;
      resource: PluginResource;
      timestamp: number;
    };
    handleResourceRegistration(pluginId, resource, mcpServer, context, getPermissionLevel(), logger);
    return { success: true };
  });

  logger.info("Subscribed to system tool/resource registration events");
}

/**
 * Handle tool registration from plugins
 * Tools already have their plugin prefix (e.g., "git-sync:status")
 */
export function handleToolRegistration(
  pluginId: string,
  tool: PluginTool,
  mcpServer: McpServer | undefined,
  context: InterfacePluginContext,
  permissionLevel: UserPermissionLevel,
  logger: Logger,
): void {
  if (!mcpServer) return;

  const toolVisibility = tool.visibility ?? "anchor";

  if (!shouldRegisterTool(permissionLevel, toolVisibility)) {
    logger.debug(
      `Skipping tool ${tool.name} from ${pluginId} - insufficient permissions`,
    );
    return;
  }

  // Register the tool - it already has its namespace from the plugin
  mcpServer.tool(
    tool.name,
    tool.description,
    tool.inputSchema,
    async (params, extra) => {
      // Extract context from MCP client metadata
      const interfaceId = extra._meta?.["interfaceId"];
      const userId = extra._meta?.["userId"];
      const channelId = extra._meta?.["channelId"];
      const progressToken = extra._meta?.progressToken;

      // Log metadata for debugging
      logger.debug("MCP client metadata", {
        tool: tool.name,
        pluginId,
        interfaceId,
        userId,
        channelId,
        progressToken,
      });

      try {
        // Execute tool through message bus using plugin-specific message type
        // This is handled by the plugin's base class which subscribes to this message
        const response = await context.sendMessage(
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
        );

        if ("success" in response && !response.success) {
          throw new Error(response.error ?? "Tool execution failed");
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                "data" in response ? response.data : response,
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        logger.error(`Tool execution error for ${tool.name}`, error);
        throw error;
      }
    },
  );

  logger.info(`Registered tool ${tool.name} from ${pluginId}`);
}

/**
 * Handle resource registration from plugins
 * Resources already have their plugin prefix if needed
 */
export function handleResourceRegistration(
  pluginId: string,
  resource: PluginResource,
  mcpServer: McpServer | undefined,
  context: InterfacePluginContext,
  permissionLevel: UserPermissionLevel,
  logger: Logger,
): void {
  if (!mcpServer) return;

  // Resources don't have visibility, so we'll default to anchor permission
  // In the future, we might want to add visibility to resources
  const resourceVisibility: UserPermissionLevel = "anchor";

  if (!shouldRegisterResource(permissionLevel, resourceVisibility)) {
    logger.debug(
      `Skipping resource ${resource.uri} from ${pluginId} - insufficient permissions`,
    );
    return;
  }

  // Register the resource - it already has its namespace if needed
  mcpServer.resource(
    resource.uri,
    resource.description ?? `Resource from ${pluginId}`,
    async () => {
      try {
        // Get resource through message bus using plugin-specific message type
        const response = await context.sendMessage(
          `plugin:${pluginId}:resource:get`,
          {
            resourceUri: resource.uri,
          },
        );

        if ("success" in response && !response.success) {
          throw new Error(response.error ?? "Resource fetch failed");
        }

        return {
          contents: [
            {
              uri: resource.uri,
              mimeType: resource.mimeType ?? "text/plain",
              text: JSON.stringify(
                "data" in response ? response.data : response,
                null,
                2,
              ),
            },
          ],
        };
      } catch (error) {
        logger.error(`Resource fetch error for ${resource.uri}`, error);
        throw error;
      }
    },
  );

  logger.info(`Registered resource ${resource.uri} from ${pluginId}`);
}

