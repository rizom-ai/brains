import { z, dbConfigSchema, type DbConfig } from "@brains/utils";
import type { Plugin, IEvalHandlerRegistry } from "@brains/plugins";
import { pluginMetadataSchema } from "@brains/plugins";
import type { PermissionConfig } from "@brains/templates";
import type { BrainCharacter, AnchorProfile } from "@brains/identity-service";
import { mkdir } from "fs/promises";

export const STANDARD_PATHS = {
  dataDir: "./data",
  cacheDir: "./cache",
  distDir: "./dist",
} as const;

export interface StandardConfig {
  database: DbConfig;
  jobQueueDatabase: DbConfig;
  conversationDatabase: DbConfig;
  embeddingDatabase: DbConfig;
  embedding: {
    cacheDir: string;
  };
}

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
    embeddingDatabase: {
      url: `file:${STANDARD_PATHS.dataDir}/embeddings.db`,
      authToken: process.env["DATABASE_AUTH_TOKEN"],
    },
    embedding: {
      cacheDir: `${STANDARD_PATHS.cacheDir}/embeddings`,
    },
  };
}

export async function getStandardConfigWithDirectories(): Promise<StandardConfig> {
  try {
    await mkdir(STANDARD_PATHS.dataDir, { recursive: true });
    await mkdir(STANDARD_PATHS.cacheDir, { recursive: true });
    await mkdir(STANDARD_PATHS.distDir, { recursive: true });
  } catch (error) {
    const msg =
      error instanceof Error && error.message.includes("EACCES")
        ? `Cannot create data directories — permission denied. Run from a writable directory or check permissions on ${STANDARD_PATHS.dataDir}`
        : `Cannot create data directories: ${error instanceof Error ? error.message : String(error)}`;
    throw new Error(msg);
  }

  return getStandardConfig();
}

export const shellConfigSchema = z.object({
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),

  database: dbConfigSchema,
  jobQueueDatabase: dbConfigSchema,
  conversationDatabase: dbConfigSchema,
  embeddingDatabase: dbConfigSchema,

  ai: z.object({
    apiKey: z.string(),
    imageApiKey: z.string().optional(),
    model: z.string().default("gpt-4.1"),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(1000),
    webSearch: z.boolean().default(true),
  }),

  embedding: z.object({
    model: z.enum(["fast-all-MiniLM-L6-v2"]).default("fast-all-MiniLM-L6-v2"),
    cacheDir: z.string(),
  }),

  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      context: z.string().default("shell"),
    })
    .default({ level: "info", context: "shell" }),

  features: z.object({}).default({}),
  plugins: z.array(pluginMetadataSchema).default([]),
  dataDir: z.string().default("./brain-data"),
  siteBaseUrl: z.string().optional(),
});

export type ShellConfig = z.infer<typeof shellConfigSchema> & {
  plugins: Plugin[];
  permissions: PermissionConfig;
  identity?: BrainCharacter;
  profile?: AnchorProfile;
  evalHandlerRegistry?: IEvalHandlerRegistry;
};

export type ShellConfigInput = Partial<
  Omit<ShellConfig, "ai" | "logging" | "database" | "embedding"> & {
    ai?: Partial<ShellConfig["ai"]>;
    logging?: Partial<ShellConfig["logging"]>;
    database?: Partial<ShellConfig["database"]>;
    embedding?: Partial<ShellConfig["embedding"]>;
  }
>;

export function createShellConfig(
  overrides: ShellConfigInput = {},
): ShellConfig {
  const standardConfig = getStandardConfig();

  const config = {
    name: overrides.name ?? "brain-app",
    version: overrides.version ?? "1.0.0",
    database: overrides.database ?? standardConfig.database,
    jobQueueDatabase:
      overrides.jobQueueDatabase ?? standardConfig.jobQueueDatabase,
    conversationDatabase:
      overrides.conversationDatabase ?? standardConfig.conversationDatabase,
    embeddingDatabase:
      overrides.embeddingDatabase ?? standardConfig.embeddingDatabase,
    ai: {
      apiKey: overrides.ai?.apiKey ?? "",
      ...(overrides.ai?.imageApiKey
        ? { imageApiKey: overrides.ai.imageApiKey }
        : {}),
      model: overrides.ai?.model ?? "gpt-4.1",
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
    permissions: overrides.permissions ?? {},
    ...(overrides.dataDir && { dataDir: overrides.dataDir }),
  };

  const validated = shellConfigSchema.parse(config);
  const result: ShellConfig = {
    ...validated,
    plugins: config.plugins,
    permissions: config.permissions,
  };

  // Guard each optional property assignment (required by exactOptionalPropertyTypes)
  if (overrides.identity !== undefined) result.identity = overrides.identity;
  if (overrides.profile !== undefined) result.profile = overrides.profile;
  if (overrides.evalHandlerRegistry !== undefined)
    result.evalHandlerRegistry = overrides.evalHandlerRegistry;
  if (overrides.siteBaseUrl !== undefined)
    result.siteBaseUrl = overrides.siteBaseUrl;

  return result;
}
