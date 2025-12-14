import type { PluginTool } from "@brains/plugins";

/**
 * Create all topics tools
 *
 * The topics plugin is fully automatic - no manual tools needed:
 * - Topics are auto-extracted when entities are created/updated
 * - Similar topics are auto-merged during processing
 * - list/get/search functionality is provided by system_list, system_get, system_search
 */
export function createTopicsTools(): PluginTool[] {
  return [];
}
