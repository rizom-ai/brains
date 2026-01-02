import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createGenerateTool } from "./generate";
import { createPublishTool } from "./publish";

export { createGenerateTool } from "./generate";
export { createPublishTool } from "./publish";

/**
 * Create all deck tools
 */
export function createDeckTools(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool[] {
  return [
    createGenerateTool(context, pluginId),
    createPublishTool(context, pluginId),
  ];
}
