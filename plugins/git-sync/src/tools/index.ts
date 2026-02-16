import type { PluginTool, ServicePluginContext } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import type { GitSync } from "../lib/git-sync";

export function createGitSyncTools(
  gitSync: GitSync,
  pluginId: string,
  context: ServicePluginContext,
): PluginTool[] {
  return [
    createTool(
      pluginId,
      "sync",
      "Sync brain data with git repository (commit, push, pull). Use when users want to backup or sync their data.",
      {},
      async (_input, toolContext) => {
        const jobId = await context.jobs.enqueue(
          "sync",
          { manualSync: true },
          toolContext,
          {
            source: `${pluginId}_sync`,
            metadata: {
              operationType: "file_operations",
              operationTarget: "sync",
            },
          },
        );

        return {
          success: true,
          data: { jobId },
          message: `Git sync started (jobId: ${jobId})`,
        };
      },
    ),
    createTool(
      pluginId,
      "status",
      "Get git repository status. Use when users ask about sync status, pending changes, or version control state.",
      {},
      async () => {
        const status = await gitSync.getStatus();

        return {
          success: true,
          data: {
            isRepo: status.isRepo,
            hasChanges: status.hasChanges,
            ahead: status.ahead,
            behind: status.behind,
            branch: status.branch,
            lastCommit: status.lastCommit,
            remote: status.remote,
            files: status.files,
          },
        };
      },
      { visibility: "public" },
    ),
  ];
}
