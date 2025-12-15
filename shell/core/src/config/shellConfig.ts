import { z } from "@brains/utils";
import type { Plugin, IEvalHandlerRegistry } from "@brains/plugins";
import { pluginMetadataSchema } from "@brains/plugins";
import type { PermissionConfig } from "@brains/permission-service";
import type { IdentityBody } from "@brains/identity-service";
import type { ProfileBody } from "@brains/profile-service";
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
 * Standard configuration type
 */
export interface StandardConfig {
  database: {
    url: string;
    authToken: string | undefined;
  };
  jobQueueDatabase: {
    url: string;
    authToken: string | undefined;
  };
  conversationDatabase: {
    url: string;
    authToken: string | undefined;
  };
  embedding: {
    cacheDir: string;
  };
}

/**
 * Get standard configuration with required paths
 * This is the single source of truth for all path configuration
 */
export function getStandardConfig(): StandardConfig {
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
export async function getStandardConfigWithDirectories(): Promise<StandardConfig> {
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
  // App metadata
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),

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
    model: z.string().default("claude-haiku-4-5-20251001"),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(1000),
    webSearch: z.boolean().default(true),
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
    .default({
      level: "info",
      context: "shell",
    }),

  // Feature flags (removed enablePlugins - it doesn't make sense)
  features: z.object({}).default({}),

  // Plugins - validate metadata structure, trust the register function exists
  plugins: z.array(pluginMetadataSchema).default([]),

  // Data directory - where plugins store entity files (e.g., directory-sync, git-sync)
  // Default: ./brain-data, can be overridden for evals or custom deployments
  dataDir: z.string().default("./brain-data"),
});

export type ShellConfig = z.infer<typeof shellConfigSchema> & {
  plugins: Plugin[];
  permissions: PermissionConfig;
  identity?: IdentityBody;
  profile?: ProfileBody;
  evalHandlerRegistry?: IEvalHandlerRegistry;
};

/**
 * Input type for createShellConfig that allows partial nested objects
 * This enables callers to provide just { ai: { apiKey: "..." } } without all other ai fields
 */
export type ShellConfigInput = Partial<
  Omit<ShellConfig, "ai" | "logging" | "database" | "embedding"> & {
    ai?: Partial<ShellConfig["ai"]>;
    logging?: Partial<ShellConfig["logging"]>;
    database?: Partial<ShellConfig["database"]>;
    embedding?: Partial<ShellConfig["embedding"]>;
  }
>;

/**
 * Create a shell configuration using standard paths
 * Simple and direct - no excessive indirection
 */
export function createShellConfig(
  overrides: ShellConfigInput = {},
): ShellConfig {
  // Get standard config if not provided
  const standardConfig = getStandardConfig();

  // Build config with standard values or overrides
  const config = {
    name: overrides.name ?? "brain-app",
    version: overrides.version ?? "1.0.0",
    database: overrides.database ?? standardConfig.database,
    jobQueueDatabase:
      overrides.jobQueueDatabase ?? standardConfig.jobQueueDatabase,
    conversationDatabase:
      overrides.conversationDatabase ?? standardConfig.conversationDatabase,
    ai: {
      provider: "anthropic" as const,
      apiKey: process.env["ANTHROPIC_API_KEY"] ?? overrides.ai?.apiKey ?? "",
      model: overrides.ai?.model ?? "claude-haiku-4-5-20251001",
      temperature: overrides.ai?.temperature ?? 0.7,
      maxTokens: overrides.ai?.maxTokens ?? 1000,
      webSearch: overrides.ai?.webSearch ?? true,
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
  const result: ShellConfig = {
    ...validated,
    plugins: config.plugins,
    permissions: config.permissions,
  };

  // Only add identity if it's defined (exactOptionalPropertyTypes requirement)
  if (overrides.identity !== undefined) {
    result.identity = overrides.identity;
  }

  // Only add profile if it's defined (exactOptionalPropertyTypes requirement)
  if (overrides.profile !== undefined) {
    result.profile = overrides.profile;
  }

  // Only add evalHandlerRegistry if it's defined (exactOptionalPropertyTypes requirement)
  if (overrides.evalHandlerRegistry !== undefined) {
    result.evalHandlerRegistry = overrides.evalHandlerRegistry;
  }

  return result;
}
