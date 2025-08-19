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
    {
      name: "sync-status",
      description: "Get directory sync status",
      usage: "/sync-status",
      handler: async (_args, _context): Promise<CommandResponse> => {
        const status = await directorySync.getStatus();
        const { syncPath, exists, watching, lastSync, stats } = status;

        let message = `📊 **Directory Sync Status**\n`;
        message += `📁 Path: \`${syncPath}\`\n`;
        message += `✅ Initialized: ${exists ? "Yes" : "No"}\n`;
        message += `👁️ Watching: ${watching ? "Yes" : "No"}\n`;
        message += `📝 Entity count: ${stats.totalFiles} total`;

        if (Object.keys(stats.byEntityType).length > 0) {
          message += " (";
          const types = Object.entries(stats.byEntityType)
            .map(([type, count]) => `${type}: ${count}`)
            .join(", ");
          message += types + ")";
        }

        if (lastSync) {
          message += `\n🕐 Last sync: ${new Date(lastSync).toLocaleString()}`;
        }

        return {
          type: "message",
          message,
        };
      },
    },
  ];
}
