import { z } from "@brains/utils";
import { basePluginConfigSchema } from "@brains/plugins";

export const gitSyncConfigSchema = basePluginConfigSchema
  .extend({
    enabled: z.boolean().default(true),
    debug: z.boolean().default(false),
    gitUrl: z.string().describe("Git repository URL (https or ssh)"),
    branch: z.string().describe("Git branch to sync").default("main"),
    autoSync: z.boolean().describe("Enable automatic syncing").default(false),
    syncInterval: z
      .number()
      .min(1)
      .describe("Sync interval in minutes")
      .default(5),
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
