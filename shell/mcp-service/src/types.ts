import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z, type ZodRawShape, type ProgressNotification } from "@brains/utils";
import type { UserPermissionLevel } from "@brains/permission-service";

/**
 * Tool visibility levels for permission control
 * Uses the same levels as UserPermissionLevel for consistency
 */
export type ToolVisibility = UserPermissionLevel;

/**
 * Tool execution context
 * Provides progress reporting and routing metadata
 */
export interface ToolContext {
  // Progress reporting
  progressToken?: string | number;
  sendProgress?: (notification: ProgressNotification) => Promise<void>;

  // Routing metadata for job creation (required for proper context propagation)
  interfaceType: string; // Which interface called the tool (e.g., "mcp", "cli", "matrix")
  userId: string; // User who invoked the tool
  channelId?: string; // Channel/room context (for Matrix, etc.)
}

/**
 * Schema for ToolContext routing metadata
 * Used to validate routing information in tool execution requests
 */
export const ToolContextRoutingSchema = z.object({
  interfaceType: z.string(),
  userId: z.string(),
  channelId: z.string().optional(),
});

/**
 * Base tool response schema
 */
export const toolResponseSchema = z
  .object({
    status: z.string().optional(),
    message: z.string().optional(),
    success: z.boolean().optional(),
    data: z.record(z.string(), z.unknown()).optional(), // Generic data object
  })
  .passthrough(); // Allow additional fields

export type ToolResponse = z.infer<typeof toolResponseSchema>;

/**
 * Plugin tool definition
 */
export interface PluginTool {
  name: string;
  description: string;
  inputSchema: ZodRawShape; // Same type as MCP expects
  handler: (input: unknown, context: ToolContext) => Promise<ToolResponse>;
  visibility?: ToolVisibility; // Default: "anchor" for safety - only explicitly marked tools are public
}

/**
 * Plugin resource definition
 */
export interface PluginResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
  handler: () => Promise<{
    contents: Array<{
      text: string;
      uri: string;
      mimeType?: string;
    }>;
  }>;
}

/**
 * Minimal interface exposed to transport layers
 * Only provides what's needed to connect transports to the MCP server
 */
export interface IMCPTransport {
  /**
   * Get the underlying MCP server for transport layers to connect to
   * Transport layers should import McpServer type from @modelcontextprotocol/sdk directly
   */
  getMcpServer(): McpServer;

  /**
   * Set the permission level for this transport
   */
  setPermissionLevel(level: UserPermissionLevel): void;
}

/**
 * Full MCP Service interface for managing tool and resource registration
 * Extends the transport interface with registration capabilities
 */
export interface IMCPService extends IMCPTransport {
  /**
   * Register a tool with the MCP server
   */
  registerTool(pluginId: string, tool: PluginTool): void;

  /**
   * Register a resource with the MCP server
   */
  registerResource(pluginId: string, resource: PluginResource): void;

  /**
   * List all registered tools
   */
  listTools(): Array<{ pluginId: string; tool: PluginTool }>;

  /**
   * List tools filtered by user permission level
   * Used for per-message filtering in multi-user contexts (e.g., Matrix rooms)
   */
  listToolsForPermissionLevel(
    userLevel: UserPermissionLevel,
  ): Array<{ pluginId: string; tool: PluginTool }>;

  /**
   * List all registered resources
   */
  listResources(): Array<{ pluginId: string; resource: PluginResource }>;
}

/**
 * Tool registration info
 */
export interface ToolInfo {
  name: string;
  description: string;
  pluginId: string;
}
