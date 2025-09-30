import type { Command, CommandResponse } from "@brains/plugins";
import type { GitSync } from "../lib/git-sync";

export function createGitSyncCommands(gitSync: GitSync): Command[] {
  return [
    {
      name: "git-sync",
      description: "Synchronize with remote git repository",
      usage: "/git-sync",
      handler: async (_args, _context): Promise<CommandResponse> => {
        try {
          await gitSync.sync();

          // Get status to show summary
          const status = await gitSync.getStatus();

          let message = "✅ **Git sync completed**\n";
          if (status.files && status.files.length > 0) {
            message += `📝 Changes synced: ${status.files.length} files\n`;
          }
          if (status.ahead > 0) {
            message += `⬆️  Pushed: ${status.ahead} commits\n`;
          }
          if (status.behind > 0) {
            message += `⬇️  Pulled: ${status.behind} commits\n`;
          }
          if (!status.hasChanges && status.ahead === 0 && status.behind === 0) {
            message += "📊 Repository is up to date";
          }

          return {
            type: "message",
            message,
          };
        } catch (error) {
          return {
            type: "message",
            message: `❌ **Git sync failed**: ${error instanceof Error ? error.message : "Unknown error occurred"}`,
          };
        }
      },
    },
  ];
}