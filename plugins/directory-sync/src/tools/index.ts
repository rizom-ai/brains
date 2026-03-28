import type { Tool } from "@brains/plugins";
import { createTool } from "@brains/plugins";
import { z } from "@brains/utils";
import type { DirectorySync } from "../lib/directory-sync";
import type { GitSync } from "../lib/git-sync";

export function createDirectorySyncTools(
  directorySync: DirectorySync,
  pluginId: string,
  gitSync?: GitSync,
): Tool[] {
  return [
    createTool(
      pluginId,
      "sync",
      "Sync brain entities with the filesystem. Pulls from git, imports files, cleans up orphans, commits and pushes changes.",
      z.object({}),
      async () => {
        try {
          const result = await directorySync.fullSync(gitSync);

          const parts = [`Synced ${result.imported} entities`];
          if (result.gitPulled) parts.push("pulled from git");
          if (result.gitPushed) parts.push("pushed to git");

          return {
            success: true,
            data: result,
            message: parts.join(", "),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Sync failed",
          };
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

          return { success: true, data };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error ? error.message : "Status check failed",
          };
        }
      },
      { visibility: "public" },
    ),
  ];
}
