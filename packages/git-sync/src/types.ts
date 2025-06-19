import { z } from "zod";
import { createPluginConfig } from "@brains/utils";

export const gitSyncConfigSchema = createPluginConfig(
  {
    gitUrl: z.string().describe("Git repository URL (https or ssh)"),
    branch: z.string().default("main").describe("Git branch to sync"),
    autoSync: z.boolean().default(false).describe("Enable automatic syncing"),
    syncInterval: z
      .number()
      .min(1)
      .default(30)
      .describe("Sync interval in minutes"),
    commitMessage: z
      .string()
      .optional()
      .describe("Custom commit message template"),
    authorName: z.string().optional().describe("Git author name"),
    authorEmail: z.string().optional().describe("Git author email"),
    directorySync: z
      .string()
      .optional()
      .describe("ID of directory-sync plugin to use"),
  },
  "Configuration for the git-sync plugin",
);

export type GitSyncConfig = z.infer<typeof gitSyncConfigSchema>;
export type GitSyncConfigInput = z.input<typeof gitSyncConfigSchema>;
