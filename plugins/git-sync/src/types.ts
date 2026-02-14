import { z } from "@brains/utils";
import { basePluginConfigSchema } from "@brains/plugins";

export const gitSyncConfigSchema = basePluginConfigSchema
  .extend({
    enabled: z.boolean().default(true),
    debug: z.boolean().default(false),
    repo: z
      .string()
      .optional()
      .describe(
        "GitHub repository in owner/name format (e.g., 'acme/brain-data')",
      ),
    gitUrl: z
      .string()
      .optional()
      .describe(
        "Git remote URL (defaults to https://github.com/{repo}.git when repo is set)",
      ),
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
    autoPush: z
      .boolean()
      .describe("Automatically push after commits")
      .default(true),
    commitDebounce: z
      .number()
      .min(100)
      .describe("Debounce time in ms before committing entity changes")
      .default(5000),
  })
  .describe("Configuration for the git-sync plugin");

export type GitSyncConfig = z.infer<typeof gitSyncConfigSchema>;
