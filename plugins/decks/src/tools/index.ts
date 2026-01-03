import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createGenerateTool } from "./generate";

export { createGenerateTool } from "./generate";

/**
 * Create all deck tools
 * Publish tool removed - use publish-pipeline_publish instead
 */
export function createDeckTools(
  context: ServicePluginContext,
  pluginId: string,
): PluginTool[] {
  return [createGenerateTool(context, pluginId)];
}
