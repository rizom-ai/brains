import { z } from "@brains/utils/zod";
import { DEFAULT_MAX_IMPORT_FILE_BYTES } from "../lib/oversized-file-error";

/**
 * Git configuration for directory sync
 */
export const directorySyncGitConfigSchema: z.ZodObject<{
  repo: z.ZodOptional<z.ZodString>;
  gitUrl: z.ZodOptional<z.ZodString>;
  branch: z.ZodDefault<z.ZodString>;
  authToken: z.ZodOptional<z.ZodString>;
  authorName: z.ZodDefault<z.ZodString>;
  authorEmail: z.ZodDefault<z.ZodString>;
  bootstrapFromSeed: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}> = z.object({
  repo: z.string().optional().describe("GitHub repo (owner/name)"),
  gitUrl: z
    .string()
    .optional()
    .describe("Full git remote URL (overrides repo)"),
  branch: z.string().default("main").describe("Git branch to sync"),
  authToken: z.string().optional().describe("Auth token for private repos"),
  authorName: z.string().default("Brain").describe("Git commit author name"),
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
});

export type DirectorySyncGitConfig = z.output<
  typeof directorySyncGitConfigSchema
>;
export type DirectorySyncGitConfigInput = z.input<
  typeof directorySyncGitConfigSchema
>;

/**
 * Configuration schema for directory sync plugin
 */
export const directorySyncConfigSchema: z.ZodObject<{
  syncPath: z.ZodOptional<z.ZodString>;
  autoSync: z.ZodDefault<z.ZodBoolean>;
  watchInterval: z.ZodDefault<z.ZodNumber>;
  includeMetadata: z.ZodDefault<z.ZodBoolean>;
  entityTypes: z.ZodOptional<z.ZodArray<z.ZodString>>;
  initialSync: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  syncBatchSize: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
  syncPriority: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
  seedContent: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  seedContentPath: z.ZodOptional<z.ZodString>;
  strictSeedEntityTypes: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  deleteOnFileRemoval: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
  syncInterval: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
  commitDebounce: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
  maxImportFileBytes: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
  git: z.ZodOptional<typeof directorySyncGitConfigSchema>;
}> = z.object({
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
  strictSeedEntityTypes: z
    .boolean()
    .optional()
    .describe("Fail startup when seed content uses an unregistered entity type")
    .default(false),
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
  maxImportFileBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum bytes for text and inline base64 binary imports")
    .default(DEFAULT_MAX_IMPORT_FILE_BYTES),

  git: directorySyncGitConfigSchema.optional(),
});

export type DirectorySyncConfig = z.output<typeof directorySyncConfigSchema>;
export type DirectorySyncConfigInput = z.input<
  typeof directorySyncConfigSchema
>;
