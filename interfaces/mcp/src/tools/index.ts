import type { PluginTool, InterfacePluginContext } from "@brains/plugins";

/**
 * Create MCP interface tools
 * Returns standard PluginTool array like other plugins
 *
 * @param _pluginId - The plugin ID (typically "mcp")
 * @param _getContext - Function to get the interface plugin context
 */
export function createMCPTools(
  _pluginId: string,
  _getContext: () => InterfacePluginContext | undefined,
): PluginTool[] {
  // Core tools (query, search, get, check-job-status) are now provided by the system plugin
  // MCP interface only needs to provide MCP-specific tools if any
  return [];
}
