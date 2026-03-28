import type { Tool, ServicePluginContext } from "@brains/plugins";
import { createTool, toolSuccess, toolError } from "@brains/plugins";
import { z } from "@brains/utils";
import type { DirectorySync } from "../lib/directory-sync";
import type { GitSync } from "../lib/git-sync";

export function createDirectorySyncTools(
  directorySync: DirectorySync,
  pluginContext: ServicePluginContext,
  pluginId: string,
  gitSync?: GitSync,
): Tool[] {
  return [
    createTool(
      pluginId,
      "sync",
      "Sync brain entities with the filesystem. Pulls from git, imports files, cleans up orphans, then commits and pushes changes.",
      z.object({}),
      async (_input, context) => {
        try {
          // 1. Git pull (fast async I/O)
          let gitPulled = false;
          if (gitSync) {
            await gitSync.withLock(async () => {
              await gitSync.pull();
            });
            gitPulled = true;
          }

          // 2. Queue import jobs (non-blocking — returns immediately)
          const source = context.channelId
            ? `${context.interfaceType}:${context.channelId}`
            : `plugin:${pluginId}`;

          const result = await directorySync.queueSyncBatch(
            pluginContext,
            source,
          );

          if (!result) {
            return toolSuccess({ gitPulled }, "No files to sync");
          }

          // Git commit+push happens automatically via auto-commit
          // when entity changes are detected after imports complete

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
