import type { PluginTool } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import { z } from "@brains/utils";
import type { GitSync } from "../lib/git-sync";

export function createGitSyncTools(
  gitSync: GitSync,
  pluginId: string,
  requestSync: () => void,
): PluginTool[] {
  return [
    createTypedTool(
      pluginId,
      "sync",
      "Sync brain data with git repository (commit, push, pull). Use when users want to backup or sync their data.",
      z.object({}),
      async () => {
        requestSync();

        return {
          success: true,
          message: "Git sync requested",
          data: {},
        };
      },
    ),
    createTypedTool(
      pluginId,
      "status",
      "Get git repository status. Use when users ask about sync status, pending changes, or version control state.",
      z.object({}),
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
