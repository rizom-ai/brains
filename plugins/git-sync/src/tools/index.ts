import type { PluginTool, ToolResponse } from "@brains/plugins";
import { formatAsEntity } from "@brains/utils";
import type { GitSync } from "../lib/git-sync";

export function createSyncTool(gitSync: GitSync, pluginId: string): PluginTool {
  return {
    name: `${pluginId}_sync`,
    description:
      "Sync brain data with git repository (commit, push, pull). Use when users want to backup or sync their data.",
    inputSchema: {},
    visibility: "anchor",
    handler: async (): Promise<ToolResponse> => {
      await gitSync.sync();
      return {
        success: true,
        message: "Git sync completed successfully",
        formatted: "Git sync completed successfully",
      };
    },
  };
}

export function createStatusTool(
  gitSync: GitSync,
  pluginId: string,
): PluginTool {
  return {
    name: `${pluginId}_status`,
    description:
      "Get git repository status. Use when users ask about sync status, pending changes, or version control state.",
    inputSchema: {},
    visibility: "public",
    handler: async (): Promise<ToolResponse> => {
      const status = await gitSync.getStatus();

      const formatted = formatAsEntity(
        {
          branch: status.branch ?? "N/A",
          hasChanges: status.hasChanges ? "Yes" : "No",
          ahead: status.ahead ?? 0,
          behind: status.behind ?? 0,
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
  };
}

export function createGitSyncTools(
  gitSync: GitSync,
  pluginId: string,
): PluginTool[] {
  return [
    createSyncTool(gitSync, pluginId),
    createStatusTool(gitSync, pluginId),
  ];
}
