import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  PluginTool,
  PluginResource,
  UserPermissionLevel,
} from "@brains/plugins";

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
