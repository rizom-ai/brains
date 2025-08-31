import { z } from "@brains/utils";
import { basePluginConfigSchema } from "@brains/plugins";

export const gitSyncConfigSchema = basePluginConfigSchema
  .extend({
    gitUrl: z.string().describe("Git repository URL (https or ssh)"),
    branch: z.string().describe("Git branch to sync"),
    autoSync: z.boolean().describe("Enable automatic syncing"),
    syncInterval: z.number().min(1).describe("Sync interval in minutes"),
    commitMessage: z
      .string()
      .optional()
      .describe("Custom commit message template"),
    authorName: z.string().optional().describe("Git author name"),
    authorEmail: z.string().optional().describe("Git author email"),
    authToken: z
      .string()
      .optional()
      .describe("Authentication token for private repositories"),
  })
  .describe("Configuration for the git-sync plugin");

export type GitSyncConfig = z.infer<typeof gitSyncConfigSchema>;
