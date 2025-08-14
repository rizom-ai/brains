import { z } from "zod";
import type { Plugin } from "@brains/plugins";
import { pluginMetadataSchema } from "@brains/plugins";
import type { PermissionConfig } from "@brains/permission-service";
import { mkdir } from "fs/promises";

/**
 * Standard directory structure - centralized in one place
 */
export const STANDARD_PATHS = {
  dataDir: "./data",
  cacheDir: "./cache",
  distDir: "./dist",
} as const;

/**
 * Get standard configuration with required paths
 * This is the single source of truth for all path configuration
 */
export function getStandardConfig() {
  return {
    database: {
      url: `file:${STANDARD_PATHS.dataDir}/brain.db`,
      authToken: process.env["DATABASE_AUTH_TOKEN"],
    },
    jobQueueDatabase: {
      url: `file:${STANDARD_PATHS.dataDir}/brain-jobs.db`,
      authToken: process.env["JOB_QUEUE_DATABASE_AUTH_TOKEN"],
    },
    conversationDatabase: {
      url: `file:${STANDARD_PATHS.dataDir}/conversations.db`,
      authToken: process.env["CONVERSATION_DATABASE_AUTH_TOKEN"],
    },
    embedding: {
      cacheDir: `${STANDARD_PATHS.cacheDir}/embeddings`,
    },
  };
}

/**
 * Get standard configuration and ensure directories exist
 * Use this for migration scripts and setup operations
 */
export async function getStandardConfigWithDirectories() {
  // Ensure all directories exist
  await mkdir(STANDARD_PATHS.dataDir, { recursive: true });
  await mkdir(STANDARD_PATHS.cacheDir, { recursive: true });
  await mkdir(STANDARD_PATHS.distDir, { recursive: true });

  return getStandardConfig();
}

/**
 * Shell configuration schema
 */
export const shellConfigSchema = z.object({
  // Database configuration (required - no defaults)
  database: z.object({
    url: z.string(),
    authToken: z.string().optional(),
  }),

  // Job Queue Database configuration (required - no defaults)
  jobQueueDatabase: z.object({
    url: z.string(),
    authToken: z.string().optional(),
  }),

  // Conversation Database configuration (required - no defaults)
  conversationDatabase: z.object({
    url: z.string(),
    authToken: z.string().optional(),
  }),

  // AI Service configuration
  ai: z.object({
    provider: z.enum(["anthropic"]).default("anthropic"),
    apiKey: z.string(),
    model: z.string().default("claude-3-haiku-20240307"),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(1000),
  }),

  // Embedding configuration (required - no defaults)
  embedding: z.object({
    model: z.enum(["fast-all-MiniLM-L6-v2"]).default("fast-all-MiniLM-L6-v2"),
    cacheDir: z.string(),
  }),

  // Logging configuration
  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      context: z.string().default("shell"),
    })
    .default({}),

  // Feature flags (removed enablePlugins - it doesn't make sense)
  features: z.object({}).default({}),

  // Plugins - validate metadata structure, trust the register function exists
  plugins: z.array(pluginMetadataSchema).default([]),
});

export type ShellConfig = z.infer<typeof shellConfigSchema> & {
  plugins: Plugin[];
  permissions: PermissionConfig;
};

/**
 * Create a shell configuration using standard paths
 * Simple and direct - no excessive indirection
 */
export function createShellConfig(
  overrides: Partial<ShellConfig> = {},
): ShellConfig {
  // Get standard config if not provided
  const standardConfig = getStandardConfig();

  // Build config with standard values or overrides
  const config = {
    database: overrides.database ?? standardConfig.database,
    jobQueueDatabase:
      overrides.jobQueueDatabase ?? standardConfig.jobQueueDatabase,
    conversationDatabase:
      overrides.conversationDatabase ?? standardConfig.conversationDatabase,
    ai: {
      provider: "anthropic" as const,
      apiKey: process.env["ANTHROPIC_API_KEY"] ?? overrides.ai?.apiKey ?? "",
      model: overrides.ai?.model ?? "claude-3-haiku-20240307",
      temperature: overrides.ai?.temperature ?? 0.7,
      maxTokens: overrides.ai?.maxTokens ?? 1000,
    },
    embedding: overrides.embedding ?? standardConfig.embedding,
    logging: {
      level: overrides.logging?.level ?? "info",
      context: overrides.logging?.context ?? "shell",
    },
    features: {},
    plugins: overrides.plugins ?? [],
    permissions: overrides.permissions ?? {}, // Default to empty permissions
  };

  // Validate schema and return with plugins
  const validated = shellConfigSchema.parse(config);
  return {
    ...validated,
    plugins: config.plugins,
    permissions: config.permissions,
  };
}
