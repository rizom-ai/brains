import type { PluginTool, ToolContext, ToolResponse } from "@brains/plugins";
import type { DirectorySync } from "../lib/directory-sync";
import type { ServicePluginContext } from "@brains/plugins";

export function createDirectorySyncTools(
  directorySync: DirectorySync,
  pluginContext: ServicePluginContext,
  pluginId: string,
): PluginTool[] {
  return [
    {
      name: `${pluginId}_sync`,
      description: "Synchronize all entities with directory (async)",
      inputSchema: {},
      visibility: "anchor",
      handler: async (
        _input: unknown,
        context: ToolContext,
      ): Promise<ToolResponse> => {
        const source = context.channelId
          ? `${context.interfaceType}:${context.channelId}`
          : `plugin:${pluginId}`;

        const metadata: {
          progressToken?: string;
          pluginId?: string;
        } = {
          pluginId,
        };

        const progressToken = context.progressToken?.toString();
        if (progressToken !== undefined) {
          metadata.progressToken = progressToken;
        }

        const result = await directorySync.queueSyncBatch(
          pluginContext,
          source,
          metadata,
        );

        if (!result) {
          return {
            status: "completed",
            message: "No operations needed - no entity types or files to sync",
            batchId: `empty-sync-${Date.now()}`,
          };
        }

        return {
          status: "queued",
          message: `Sync batch operation queued: ${result.exportOperationsCount} export jobs, ${result.importOperationsCount} import jobs for ${result.totalFiles} files`,
          batchId: result.batchId,
          exportOperations: result.exportOperationsCount,
          importOperations: result.importOperationsCount,
          totalFiles: result.totalFiles,
        };
      },
    },
  ];
}
