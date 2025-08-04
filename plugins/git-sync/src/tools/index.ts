import type { PluginTool } from "@brains/plugins";
import type { GitSync } from "../lib/git-sync";
import { z } from "zod";

export function createGitSyncTools(gitSync: GitSync): PluginTool[] {
  return [
    {
      name: "git-sync:sync",
      description: "Perform full git sync (export, commit, push, pull)",
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
      name: "git-sync:status",
      description: "Get git repository status",
      inputSchema: {},
      visibility: "public",
      handler: async (): Promise<unknown> => {
        return gitSync.getStatus();
      },
    },
    {
      name: "git-sync:commit",
      description: "Commit current changes",
      inputSchema: {
        commitMessage: z.string().optional(),
      },
      visibility: "anchor",
      handler: async (input: unknown): Promise<{ message: string }> => {
        const { commitMessage } = input as { commitMessage?: string };
        await gitSync.commit(commitMessage);
        return {
          message: "Changes committed successfully",
        };
      },
    },
    {
      name: "git-sync:push",
      description: "Push commits to remote repository",
      inputSchema: {},
      visibility: "anchor",
      handler: async (): Promise<{ message: string }> => {
        await gitSync.push();
        return {
          message: "Changes pushed to remote successfully",
        };
      },
    },
    {
      name: "git-sync:pull",
      description: "Pull changes from remote repository",
      inputSchema: {},
      visibility: "anchor",
      handler: async (): Promise<{ message: string }> => {
        await gitSync.pull();
        return {
          message: "Changes pulled from remote successfully",
        };
      },
    },
    {
      name: "git-sync:auto-sync",
      description: "Start or stop automatic synchronization",
      inputSchema: {
        autoSync: z.boolean(),
      },
      visibility: "anchor",
      handler: async (input: unknown): Promise<{ message: string }> => {
        const { autoSync } = input as { autoSync: boolean };

        if (autoSync) {
          gitSync.startAutoSync();
          return { message: "Auto-sync started" };
        } else {
          gitSync.stopAutoSync();
          return { message: "Auto-sync stopped" };
        }
      },
    },
  ];
}
