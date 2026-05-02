import { z } from "@brains/utils";

/**
 * Configuration schema for directory sync plugin
 */
export const directorySyncConfigSchema = z.object({
  syncPath: z
    .string()
    .optional()
    .describe(
      "Optional override for sync directory (defaults to shell dataDir)",
    ),
  autoSync: z
    .boolean()
    .describe("Enable bidirectional auto-sync")
    .default(true),
  watchInterval: z
    .number()
    .describe("File watch polling interval in ms")
    .default(1000),
  includeMetadata: z
    .boolean()
    .describe("Include frontmatter metadata")
    .default(true),
  entityTypes: z
    .array(z.string())
    .optional()
    .describe("Specific entity types to sync"),
  initialSync: z
    .boolean()
    .optional()
    .describe("Run initial directory import during startup coordination")
    .default(true),
  syncBatchSize: z
    .number()
    .optional()
    .describe("Batch size for sync operations")
    .default(10),
  syncPriority: z
    .number()
    .min(1)
    .max(10)
    .optional()
    .describe("Job priority (1-10)")
    .default(3),
  seedContent: z
    .boolean()
    .optional()
    .describe("Copy seed content on first initialization")
    .default(true),
  seedContentPath: z
    .string()
    .optional()
    .describe(
      "Custom path to seed content directory (defaults to CWD/seed-content)",
    ),
  deleteOnFileRemoval: z
    .boolean()
    .optional()
    .describe("Delete entities from database when files are deleted")
    .default(true),
  syncInterval: z
    .number()
    .min(1)
    .optional()
    .describe("Pull/push interval in minutes (requires git)")
    .default(2),
  commitDebounce: z
    .number()
    .min(100)
    .optional()
    .describe("Debounce delay in ms before git commit after entity changes")
    .default(5000),

  git: z
    .object({
      repo: z.string().optional().describe("GitHub repo (owner/name)"),
      gitUrl: z
        .string()
        .optional()
        .describe("Full git remote URL (overrides repo)"),
      branch: z.string().default("main").describe("Git branch to sync"),
      authToken: z.string().optional().describe("Auth token for private repos"),
      authorName: z
        .string()
        .default("Brain")
        .describe("Git commit author name"),
      authorEmail: z
        .string()
        .default("brain@localhost")
        .describe("Git commit author email"),
      bootstrapFromSeed: z
        .boolean()
        .optional()
        .default(true)
        .describe(
          "Bootstrap a missing/empty local file:// content remote from seedContentPath",
        ),
    })
    .optional(),
});

export type DirectorySyncConfig = z.infer<typeof directorySyncConfigSchema>;
