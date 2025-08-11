import { z } from "zod";
import type { Plugin } from "@brains/plugins";
import { pluginMetadataSchema } from "@brains/plugins";

/**
 * Shell configuration schema
 */
export const shellConfigSchema = z.object({
  // Database configuration
  database: z
    .object({
      url: z.string().default("file:./brain.db"),
      authToken: z.string().optional(),
    })
    .default({}),

  // Job Queue Database configuration
  jobQueueDatabase: z
    .object({
      url: z.string().default("file:./brain-jobs.db"),
      authToken: z.string().optional(),
    })
    .default({}),

  // Conversation Database configuration
  conversationDatabase: z
    .object({
      url: z.string().default("file:./conversation-memory.db"),
      authToken: z.string().optional(),
    })
    .default({}),

  // AI Service configuration
  ai: z.object({
    provider: z.enum(["anthropic"]).default("anthropic"),
    apiKey: z.string(),
    model: z.string().default("claude-3-haiku-20240307"),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(1000),
  }),

  // Embedding configuration
  embedding: z
    .object({
      model: z.enum(["fast-all-MiniLM-L6-v2"]).default("fast-all-MiniLM-L6-v2"),
      cacheDir: z.string().optional(),
    })
    .default({}),

  // Logging configuration
  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      context: z.string().default("shell"),
    })
    .default({}),

  // Feature flags
  features: z
    .object({
      enablePlugins: z.boolean().default(true),
    })
    .default({}),

  // Plugins - validate metadata structure, trust the register function exists
  plugins: z.array(pluginMetadataSchema).default([]),
});

export type ShellConfig = z.infer<typeof shellConfigSchema> & {
  plugins: Plugin[];
};

/**
 * Create a shell configuration from environment variables and overrides
 */
export function createShellConfig(
  overrides: Partial<ShellConfig> = {},
): ShellConfig {
  // Build config from environment with overrides
  const config = {
    database: {
      url: process.env["DATABASE_URL"] ?? overrides.database?.url,
      authToken:
        process.env["DATABASE_AUTH_TOKEN"] ?? overrides.database?.authToken,
    },
    jobQueueDatabase: {
      url:
        process.env["JOB_QUEUE_DATABASE_URL"] ??
        overrides.jobQueueDatabase?.url,
      authToken:
        process.env["JOB_QUEUE_DATABASE_AUTH_TOKEN"] ??
        overrides.jobQueueDatabase?.authToken,
    },
    conversationDatabase: {
      url:
        process.env["CONVERSATION_DATABASE_URL"] ??
        overrides.conversationDatabase?.url,
      authToken:
        process.env["CONVERSATION_DATABASE_AUTH_TOKEN"] ??
        overrides.conversationDatabase?.authToken,
    },
    ai: {
      provider: "anthropic" as const,
      apiKey: process.env["ANTHROPIC_API_KEY"] ?? overrides.ai?.apiKey ?? "",
      model: process.env["AI_MODEL"] ?? overrides.ai?.model,
      temperature: overrides.ai?.temperature,
      maxTokens: overrides.ai?.maxTokens,
    },
    embedding: {
      model: "fast-all-MiniLM-L6-v2" as const,
      cacheDir:
        process.env["FASTEMBED_CACHE_DIR"] ?? overrides.embedding?.cacheDir,
    },
    logging: {
      level: process.env["LOG_LEVEL"] ?? overrides.logging?.level,
      context: overrides.logging?.context,
    },
    features: {
      enablePlugins: overrides.features?.enablePlugins,
    },
    plugins: overrides.plugins ?? [],
  };

  // Validate schema and return with plugins
  const validated = shellConfigSchema.parse(config);
  return {
    ...validated,
    plugins: config.plugins, // Use the plugins from config, not overrides again
  };
}
