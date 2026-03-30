import type { Tool, ServicePluginContext } from "@brains/plugins";
import { createTool, toolSuccess, toolError } from "@brains/plugins";
import { z } from "@brains/utils";
import type { IDirectorySync, IGitSync } from "../types";

export function createDirectorySyncTools(
  directorySync: IDirectorySync,
  pluginContext: ServicePluginContext,
  pluginId: string,
  gitSync?: IGitSync,
): Tool[] {
  return [
    createTool(
      pluginId,
      "sync",
      "Sync brain entities with the filesystem. Pulls from git if configured, then imports files. Git commit and push happen automatically after imports complete.",
      z.object({}),
      async (_input, context) => {
        try {
          const source = context.channelId
            ? `${context.interfaceType}:${context.channelId}`
            : `plugin:${pluginId}`;

          const metadata = {
            interfaceType: context.interfaceType,
            channelId: context.channelId,
          };

          // Pull under lock so the file listing sees post-pull state
          let gitPulled = false;
          if (gitSync) {
            await gitSync.withLock(() => gitSync.pull());
            gitPulled = true;
          }

          const result = await directorySync.queueSyncBatch(
            pluginContext,
            source,
            metadata,
          );

          if (!result) {
            return toolSuccess({ gitPulled }, "No files to sync");
          }

          return toolSuccess(
            {
              batchId: result.batchId,
              importOperations: result.importOperationsCount,
              totalFiles: result.totalFiles,
              gitPulled,
            },
            `Sync started: ${result.importOperationsCount} import jobs queued for ${result.totalFiles} files${gitPulled ? " (pulled from git)" : ""}`,
          );
        } catch (error) {
          return toolError(
            error instanceof Error ? error.message : "Sync failed",
          );
        }
      },
      {
        cli: { name: "sync" },
      },
    ),
    createTool(
      pluginId,
      "status",
      "Get sync and git repository status — last sync time, watching state, pending git changes.",
      z.object({}),
      async () => {
        try {
          const syncStatus = await directorySync.getStatus();

          const data: Record<string, unknown> = {
            syncPath: syncStatus.syncPath,
            lastSync: syncStatus.lastSync?.toISOString(),
            watching: syncStatus.watching,
          };

          if (gitSync) {
            const gitStatus = await gitSync.getStatus();
            data["git"] = {
              isRepo: gitStatus.isRepo,
              branch: gitStatus.branch,
              hasChanges: gitStatus.hasChanges,
              ahead: gitStatus.ahead,
              behind: gitStatus.behind,
              remote: gitStatus.remote,
            };
          }

          return toolSuccess(data);
        } catch (error) {
          return toolError(
            error instanceof Error ? error.message : "Status check failed",
          );
        }
      },
      { visibility: "public" },
    ),
  ];
}
