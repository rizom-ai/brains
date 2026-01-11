import type { PluginTool } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { formatAsEntity } from "@brains/utils";
import type { GitSync } from "../lib/git-sync";

export function createGitSyncTools(
  gitSync: GitSync,
  pluginId: string,
): PluginTool[] {
  return [
    createTool(
      pluginId,
      "sync",
      "Sync brain data with git repository (commit, push, pull). Use when users want to backup or sync their data.",
      {},
      async () => {
        // Pass manualSync = true since user explicitly requested sync
        // This ensures changes are pushed to remote in a single call
        await gitSync.sync(true);
        return {
          success: true,
          message: "Git sync completed successfully",
          formatted: "Git sync completed successfully",
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

        const formatted = formatAsEntity(
          {
            branch: status.branch,
            hasChanges: status.hasChanges ? "Yes" : "No",
            ahead: status.ahead,
            behind: status.behind,
            lastCommit: status.lastCommit ?? "N/A",
          },
          { title: "Git Status" },
        );

        return {
          success: true,
          status: "ok",
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
          formatted,
        };
      },
      { visibility: "public" },
    ),
  ];
}
