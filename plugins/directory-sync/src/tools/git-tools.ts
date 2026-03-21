import type { PluginTool } from "@brains/plugins";
import { createTypedTool } from "@brains/plugins";
import { z } from "@brains/utils";
import type { GitSync } from "../lib/git-sync";

export function createGitTools(
  gitSync: GitSync,
  pluginId: string,
): PluginTool[] {
  return [
    createTypedTool(
      pluginId,
      "git_sync",
      "Commit and push brain data to git. Use when users want to backup or sync their data.",
      z.object({}),
      async () => {
        await gitSync.commit();
        await gitSync.push();
        return { success: true, message: "Git sync completed", data: {} };
      },
    ),
    createTypedTool(
      pluginId,
      "git_status",
      "Get git repository status — pending changes, branch, remote.",
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
