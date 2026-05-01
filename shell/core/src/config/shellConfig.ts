import { z, dbConfigSchema } from "@brains/utils";
import type {
  Plugin,
  IEvalHandlerRegistry,
  EntityDisplayEntry,
} from "@brains/plugins";
import { pluginMetadataSchema } from "@brains/plugins";
import type { PermissionConfig } from "@brains/templates";
import type { BrainCharacter, AnchorProfile } from "@brains/identity-service";
import { mkdir } from "fs/promises";
import {
  createStandardConfig,
  createStandardPaths,
  type StandardConfig,
} from "./standardConfig";

export type { StandardConfig } from "./standardConfig";

export const STANDARD_PATHS = createStandardPaths();

export function getStandardConfig(): StandardConfig {
  return createStandardConfig(STANDARD_PATHS);
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
    model: z.string(),
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
      format: z.enum(["text", "json"]).default("text"),
      file: z.string().optional(),
      context: z.string().default("shell"),
    })
    .default({ level: "info", context: "shell" }),

  features: z.object({}).default({}),
  plugins: z.array(pluginMetadataSchema).default([]),
  dataDir: z.string().default("./brain-data"),
  siteBaseUrl: z.string().optional(),
  entityDisplay: z
    .record(
      z
        .object({
          label: z.string().min(1),
        })
        .passthrough(),
    )
    .optional(),
});

export type ShellConfig = Omit<
  z.infer<typeof shellConfigSchema>,
  "entityDisplay"
> & {
  plugins: Plugin[];
  permissions: PermissionConfig;
  identity?: BrainCharacter;
  profile?: AnchorProfile;
  evalHandlerRegistry?: IEvalHandlerRegistry;
  entityDisplay?: Record<string, EntityDisplayEntry>;
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
      ...(overrides.ai?.model ? { model: overrides.ai.model } : {}),
      temperature: overrides.ai?.temperature ?? 0.7,
      maxTokens: overrides.ai?.maxTokens ?? 1000,
      webSearch: overrides.ai?.webSearch ?? true,
    },
    embedding: overrides.embedding ?? standardConfig.embedding,
    logging: {
      level: overrides.logging?.level ?? "info",
      format: overrides.logging?.format ?? "text",
      ...(overrides.logging?.file ? { file: overrides.logging.file } : {}),
      context: overrides.logging?.context ?? "shell",
    },
    features: {},
    plugins: overrides.plugins ?? [],
    permissions: overrides.permissions ?? {},
    ...(overrides.dataDir && { dataDir: overrides.dataDir }),
    ...(overrides.siteBaseUrl && { siteBaseUrl: overrides.siteBaseUrl }),
    ...(overrides.entityDisplay && { entityDisplay: overrides.entityDisplay }),
  };

  const validated = shellConfigSchema.parse(config);
  const { entityDisplay, ...validatedRest } = validated;
  const result: ShellConfig = {
    ...validatedRest,
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
  if (entityDisplay !== undefined)
    result.entityDisplay = entityDisplay as Record<string, EntityDisplayEntry>;

  return result;
}
