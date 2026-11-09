import type { Plugin, ProtocolPluginProvider } from "@brains/plugins";
import { MCPInterface } from "../src/mcp-interface";
import type { MCPConfigInput } from "../src/config";

/**
 * The MCP interface as the brain creates it. The one place the tests name
 * how it is built, so they read the same before and after it is declared.
 */
export function createMcpPlugin(
  config: MCPConfigInput = {},
): Plugin & ProtocolPluginProvider {
  return new MCPInterface(config);
}
