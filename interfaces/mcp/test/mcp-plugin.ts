import {
  instantiatePluginPackageDefinition,
  type Plugin,
  type ProtocolPluginProvider,
} from "@brains/plugins";
import packageJson from "../package.json";
import mcpInterface from "../src";
import type { MCPConfigInput } from "../src/config";

function providesProtocolPlugin(
  plugin: Plugin,
): plugin is Plugin & ProtocolPluginProvider {
  return (
    "createProtocolPlugin" in plugin &&
    typeof plugin.createProtocolPlugin === "function"
  );
}

/**
 * The MCP interface as the brain creates it: the package's definition,
 * under the plugin id its class had. The one place the tests name how it is
 * built, so they read the same before and after it was declared.
 */
export function createMcpPlugin(
  config: MCPConfigInput = {},
): Plugin & ProtocolPluginProvider {
  const [plugin] = instantiatePluginPackageDefinition(
    mcpInterface,
    config,
    { name: packageJson.name, version: packageJson.version },
    { pluginId: "mcp" },
  );
  if (!plugin || !providesProtocolPlugin(plugin)) {
    throw new Error("The MCP definition created no protocol host");
  }
  return plugin;
}
