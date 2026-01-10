import type {
  PluginTool,
  ServicePluginContext,
  BaseEntity,
} from "@brains/plugins";
import { createBatchExtractTool, type ExtractOptions } from "./batch-extract";

/**
 * Create all topics tools
 */
export function createTopicsTools(
  context: ServicePluginContext,
  getEntitiesToExtract: (options?: ExtractOptions) => Promise<BaseEntity[]>,
): PluginTool[] {
  return [createBatchExtractTool(context, getEntitiesToExtract)];
}
