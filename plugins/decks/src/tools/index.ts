import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createGenerateTool } from "./generate";
import { createPublishTool } from "./publish";
import { createQueueTool } from "./queue";

export { createGenerateTool } from "./generate";
export { createPublishTool } from "./publish";
export { createQueueTool } from "./queue";

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
    createQueueTool(context, pluginId),
  ];
}
