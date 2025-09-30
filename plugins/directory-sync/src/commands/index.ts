import type { Command, CommandResponse } from "@brains/plugins";
import type { DirectorySync } from "../lib/directory-sync";
import type { ServicePluginContext } from "@brains/plugins";

export function createDirectorySyncCommands(
  directorySync: DirectorySync,
  pluginContext: ServicePluginContext,
  pluginId: string,
): Command[] {
  return [
    {
      name: "directory-sync",
      description: "Synchronize all entities with directory",
      usage: "/directory-sync",
      handler: async (_args, context): Promise<CommandResponse> => {
        try {
          const source =
            context.interfaceType && context.channelId
              ? `${context.interfaceType}:${context.channelId}`
              : "command:sync";

          const result = await directorySync.queueSyncBatch(
            pluginContext,
            source,
            {
              progressToken: context.messageId,
              pluginId,
            },
          );

          if (!result) {
            return {
              type: "message",
              message:
                "✅ **Sync completed** - No operations needed (no entity types or files to sync)",
            };
          }

          return {
            type: "batch-operation",
            message: `🔄 **Sync batch started** - ${result.exportOperationsCount} export jobs, ${result.importOperationsCount} import jobs for ${result.totalFiles} files (${result.operationCount} operations)`,
            batchId: result.batchId,
            operationCount: result.operationCount,
          };
        } catch (error) {
          return {
            type: "message",
            message: `❌ **Sync failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
          };
        }
      },
    },
  ];
}
