import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createBatchExtractTool } from "./batch-extract";

/**
 * Create all topics tools
 */
export function createTopicsTools(context: ServicePluginContext): PluginTool[] {
  return [createBatchExtractTool(context)];
}
