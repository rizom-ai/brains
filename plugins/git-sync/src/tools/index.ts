import type { PluginTool, ToolResponse } from "@brains/plugins";
import type { GitSync } from "../lib/git-sync";

export function createGitSyncTools(
  gitSync: GitSync,
  pluginId: string,
): PluginTool[] {
  return [
    {
      name: `${pluginId}_sync`,
      description: "Perform full git sync (commit, push, pull)",
      inputSchema: {},
      visibility: "anchor",
      handler: async (): Promise<{ message: string }> => {
        await gitSync.sync();
        return {
          message: "Git sync completed successfully",
        };
      },
    },
    {
      name: `${pluginId}_status`,
      description: "Get git repository status",
      inputSchema: {},
      visibility: "public",
      handler: async (): Promise<ToolResponse> => {
        const status = await gitSync.getStatus();
        // Return the status wrapped in a ToolResponse structure
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
        };
      },
    },
  ];
}
