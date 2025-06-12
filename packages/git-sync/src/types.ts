import { z } from "zod";
import { createPluginConfig } from "@brains/utils";

export const gitSyncConfigSchema = createPluginConfig(
  {
    repoPath: z.string().describe("Path to the git repository"),
    remote: z.string().optional().describe("Remote repository URL"),
    branch: z.string().default("main").describe("Git branch to sync"),
    autoSync: z.boolean().default(false).describe("Enable automatic syncing"),
    syncInterval: z
      .number()
      .min(1)
      .default(30)
      .describe("Sync interval in minutes"),
  },
  "Configuration for the git-sync plugin",
);

export type GitSyncConfig = z.infer<typeof gitSyncConfigSchema>;
export type GitSyncConfigInput = z.input<typeof gitSyncConfigSchema>;
