import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import { z } from "@brains/utils";
import type { DirectorySync } from "../lib/directory-sync";

export function createDirectorySyncTools(
  directorySync: DirectorySync,
  pluginContext: ServicePluginContext,
  pluginId: string,
): PluginTool[] {
  return [
    createTypedTool(
      pluginId,
      "sync",
      "Sync brain entities with the filesystem. Use when users want to refresh content from files or save changes to disk.",
      z.object({}),
      async (_input, context) => {
        const source = context.channelId
          ? `${context.interfaceType}:${context.channelId}`
          : `plugin:${pluginId}`;

        const metadata: {
          progressToken?: string;
          pluginId?: string;
          interfaceType?: string;
          channelId?: string;
        } = {
          pluginId,
          // Routing context for progress messages
          interfaceType: context.interfaceType,
        };

        // Only set channelId if defined (exactOptionalPropertyTypes)
        if (context.channelId !== undefined) {
          metadata.channelId = context.channelId;
        }

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
            success: true,
            data: {
              jobId: "",
              batchId: "",
              exportOperations: 0,
              importOperations: 0,
              totalFiles: 0,
            },
            message: "No operations needed - no entity types or files to sync",
          };
        }

        // Include batchId as jobId for agent response tracking
        return {
          success: true,
          data: {
            jobId: result.batchId,
            batchId: result.batchId,
            exportOperations: result.exportOperationsCount,
            importOperations: result.importOperationsCount,
            totalFiles: result.totalFiles,
          },
          message: `Sync batch operation queued: ${result.exportOperationsCount} export jobs, ${result.importOperationsCount} import jobs for ${result.totalFiles} files`,
        };
      },
    ),
  ];
}
