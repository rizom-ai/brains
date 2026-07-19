import type { Tool, ServicePluginContext } from "@brains/plugins";
import { createTool, toolSuccess, toolError } from "@brains/plugins";
import { z } from "@brains/utils/zod";
import type { IDirectorySync, IGitSync } from "../types";
import type { DirectorySyncOperationStatusService } from "../lib/directory-sync-operation-status";
import { requestDirectorySync } from "../lib/request-directory-sync";
import { createHistoryTool } from "./history";

export function createDirectorySyncTools(
  directorySync: IDirectorySync,
  pluginContext: ServicePluginContext,
  pluginId: string,
  gitSync?: IGitSync,
  operationStatus?: DirectorySyncOperationStatusService,
): Tool[] {
  const tools: Tool[] = [
    createTool(
      pluginId,
      "sync",
      "Sync brain entities with the filesystem. Use this for refresh, pull, sync, or backup-to-git requests. Pulls from git if configured, then imports files. Git commit and push happen automatically after imports complete.",
      z.object({}),
      async (_input, context) => {
        try {
          const source = context.channelId
            ? `${context.interfaceType}:${context.channelId}`
            : `plugin:${pluginId}`;

          const result = await requestDirectorySync({
            context: pluginContext,
            directorySync,
            source,
            interfaceType: context.interfaceType,
            channelId: context.channelId,
            toolContext: context,
            gitSync,
            operationStatus,
          });

          if (result.gitPulled) {
            return toolSuccess(
              {
                jobId: result.jobId,
                status: result.status,
                gitPulled: true,
                ...(result.runId ? { runId: result.runId } : {}),
              },
              "Sync queued: git pull and filesystem scan will run in the background",
            );
          }

          if (result.status === "settled") {
            return toolSuccess(
              {
                gitPulled: false,
                ...(result.runId ? { runId: result.runId } : {}),
              },
              "No files to sync",
            );
          }

          return toolSuccess(
            {
              batchId: result.batchId,
              importOperations: result.importOperationsCount,
              totalFiles: result.totalFiles,
              gitPulled: false,
              ...(result.runId ? { runId: result.runId } : {}),
            },
            `Sync started: ${result.importOperationsCount} import jobs queued for ${result.totalFiles} files`,
          );
        } catch (error) {
          return toolError(
            error instanceof Error ? error.message : "Sync failed",
          );
        }
      },
      {
        visibility: "admin",
        sideEffects: "external",
        cli: { name: "sync" },
      },
    ),
    createTool(
      pluginId,
      "status",
      "Read directory and git sync status: last sync, watcher state, and pending git changes. Use this for every status follow-up after directory-sync_sync, even when that call returned a jobId; a sync jobId is not a system_job_status batchId.",
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
      { visibility: "admin", sideEffects: "none" },
    ),
  ];

  if (gitSync) {
    tools.push(createHistoryTool(pluginId, gitSync));
  }

  return tools;
}
