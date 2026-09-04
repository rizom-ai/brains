import { dbConfigSchema } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type {
  Plugin,
  IEvalHandlerRegistry,
  EntityDisplayEntry,
} from "@brains/plugins";
import { pluginMetadataSchema } from "@brains/plugins";
import type { PermissionConfig } from "@brains/templates";
import type { BrainCharacter, AnchorProfile } from "@brains/identity-service";
import {
  createStandardConfig,
  createStandardPaths,
  type StandardConfig,
  type StandardPaths,
} from "./standardConfig";

export type { StandardConfig } from "./standardConfig";

export const STANDARD_PATHS: StandardPaths = createStandardPaths();

const entityDisplayEntrySchema: z.ZodObject<
  {
    label: z.ZodString;
    pluralName: z.ZodOptional<z.ZodString>;
    layout: z.ZodOptional<z.ZodString>;
    paginate: z.ZodOptional<z.ZodBoolean>;
    pageSize: z.ZodOptional<z.ZodNumber>;
    navigation: z.ZodOptional<
      z.ZodObject<{
        show: z.ZodOptional<z.ZodBoolean>;
        slot: z.ZodOptional<
          z.ZodEnum<{ primary: "primary"; secondary: "secondary" }>
        >;
        priority: z.ZodOptional<z.ZodNumber>;
      }>
    >;
  },
  z.core.$loose
> = z.looseObject({
  label: z.string().min(1),
  pluralName: z.string().optional(),
  layout: z.string().optional(),
  paginate: z.boolean().optional(),
  pageSize: z.number().optional(),
  navigation: z
    .object({
      show: z.boolean().optional(),
      slot: z.enum(["primary", "secondary"]).optional(),
      priority: z.number().optional(),
    })
    .optional(),
});

export function getStandardConfig(): StandardConfig {
  return createStandardConfig(STANDARD_PATHS);
}

export const shellConfigSchema: z.ZodObject<{
  name: z.ZodDefault<z.ZodString>;
  version: z.ZodDefault<z.ZodString>;
  database: typeof dbConfigSchema;
  jobQueueDatabase: typeof dbConfigSchema;
  jobQueue: z.ZodPrefault<
    z.ZodObject<{ workerConcurrency: z.ZodDefault<z.ZodNumber> }>
  >;
  conversationDatabase: typeof dbConfigSchema;
  runtimeStateDatabase: typeof dbConfigSchema;
  ai: z.ZodObject<{
    apiKey: z.ZodString;
    imageApiKey: z.ZodOptional<z.ZodString>;
    model: z.ZodString;
    temperature: z.ZodDefault<z.ZodNumber>;
    maxTokens: z.ZodDefault<z.ZodNumber>;
    webSearch: z.ZodDefault<z.ZodBoolean>;
    reasoningEffort: z.ZodOptional<
      z.ZodEnum<{
        none: "none";
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        max: "max";
      }>
    >;
  }>;
  embedding: z.ZodObject<{ enabled: z.ZodDefault<z.ZodBoolean> }>;
  logging: z.ZodPrefault<
    z.ZodObject<{
      level: z.ZodDefault<
        z.ZodEnum<{
          debug: "debug";
          info: "info";
          warn: "warn";
          error: "error";
        }>
      >;
      format: z.ZodDefault<z.ZodEnum<{ text: "text"; json: "json" }>>;
      file: z.ZodOptional<z.ZodString>;
      context: z.ZodDefault<z.ZodString>;
    }>
  >;
  features: z.ZodDefault<z.ZodObject<Record<never, never>>>;
  plugins: z.ZodDefault<z.ZodArray<typeof pluginMetadataSchema>>;
  dataDir: z.ZodDefault<z.ZodString>;
  gitBrokerSocket: z.ZodOptional<z.ZodString>;
  gitBrokerCheckout: z.ZodOptional<z.ZodString>;
  spaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
  siteBaseUrl: z.ZodOptional<z.ZodString>;
  localSiteUrl: z.ZodOptional<z.ZodString>;
  preferLocalUrls: z.ZodDefault<z.ZodBoolean>;
  themeCSS: z.ZodDefault<z.ZodString>;
  entityDisplay: z.ZodOptional<
    z.ZodRecord<z.ZodString, typeof entityDisplayEntrySchema>
  >;
  profileKind: z.ZodOptional<z.ZodString>;
}> = z.object({
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),

  database: dbConfigSchema,
  jobQueueDatabase: dbConfigSchema,
  jobQueue: z
    .object({
      workerConcurrency: z.number().int().min(1).max(32).default(4),
    })
    .prefault({}),
  conversationDatabase: dbConfigSchema,
  runtimeStateDatabase: dbConfigSchema,

  ai: z.object({
    apiKey: z.string(),
    imageApiKey: z.string().optional(),
    model: z.string(),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().positive().default(1000),
    webSearch: z.boolean().default(true),
    reasoningEffort: z
      .enum(["none", "low", "medium", "high", "xhigh", "max"])
      .optional(),
  }),

  embedding: z.object({
    enabled: z.boolean().default(true),
  }),

  logging: z
    .object({
      level: z.enum(["debug", "info", "warn", "error"]).default("info"),
      format: z.enum(["text", "json"]).default("text"),
      file: z.string().optional(),
      context: z.string().default("shell"),
    })
    .prefault({ level: "info", context: "shell" }),

  features: z.object({}).default({}),
  plugins: z.array(pluginMetadataSchema).default([]),
  dataDir: z.string().default("./brain-data"),
  /**
   * Where the Git checkout owner listens, when this Brain has one.
   * Assigned by the supervisor and resolved by the app layer; absent from
   * `brain.yaml`, because it is a runtime endpoint rather than a choice.
   */
  gitBrokerSocket: z.string().min(1).optional(),
  /** Absolute checkout path assigned with the broker socket. */
  gitBrokerCheckout: z.string().min(1).optional(),
  spaces: z.array(z.string()).default([]),
  siteBaseUrl: z.string().optional(),
  localSiteUrl: z.string().optional(),
  preferLocalUrls: z.boolean().default(false),
  themeCSS: z.string().default(""),
  entityDisplay: z.record(z.string(), entityDisplayEntrySchema).optional(),
  profileKind: z.string().trim().min(1).optional(),
});

export type ShellConfigSchemaOutput = z.output<typeof shellConfigSchema>;

export type ShellConfig = Omit<
  ShellConfigSchemaOutput,
  "entityDisplay" | "plugins"
> & {
  plugins: Plugin[];
  permissions: PermissionConfig;
  identity?: BrainCharacter;
  profile?: AnchorProfile;
  agentInstructions?: string[];
  evalHandlerRegistry?: IEvalHandlerRegistry;
  entityDisplay?: Record<string, EntityDisplayEntry>;
};

export type ShellConfigInput = Partial<
  Omit<
    ShellConfig,
    "ai" | "logging" | "database" | "embedding" | "jobQueue"
  > & {
    ai?: Partial<ShellConfig["ai"]>;
    logging?: Partial<ShellConfig["logging"]>;
    database?: Partial<ShellConfig["database"]>;
    embedding?: Partial<ShellConfig["embedding"]>;
    jobQueue?: Partial<ShellConfig["jobQueue"]>;
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
    jobQueue: overrides.jobQueue ?? {},
    conversationDatabase:
      overrides.conversationDatabase ?? standardConfig.conversationDatabase,
    runtimeStateDatabase:
      overrides.runtimeStateDatabase ?? standardConfig.runtimeStateDatabase,
    ai: {
      apiKey: overrides.ai?.apiKey ?? "",
      ...(overrides.ai?.imageApiKey
        ? { imageApiKey: overrides.ai.imageApiKey }
        : {}),
      ...(overrides.ai?.model ? { model: overrides.ai.model } : {}),
      temperature: overrides.ai?.temperature ?? 0.7,
      maxTokens: overrides.ai?.maxTokens ?? 1000,
      webSearch: overrides.ai?.webSearch ?? true,
      ...(overrides.ai?.reasoningEffort && {
        reasoningEffort: overrides.ai.reasoningEffort,
      }),
    },
    embedding: {
      ...standardConfig.embedding,
      ...overrides.embedding,
    },
    logging: {
      level: overrides.logging?.level ?? "info",
      format: overrides.logging?.format ?? "text",
      ...(overrides.logging?.file ? { file: overrides.logging.file } : {}),
      context: overrides.logging?.context ?? "shell",
    },
    features: {},
    plugins: overrides.plugins ?? [],
    permissions: overrides.permissions ?? {},
    spaces: overrides.spaces ?? [],
    preferLocalUrls: overrides.preferLocalUrls ?? false,
    ...(overrides.dataDir && { dataDir: overrides.dataDir }),
    ...(overrides.gitBrokerSocket && {
      gitBrokerSocket: overrides.gitBrokerSocket,
    }),
    ...(overrides.gitBrokerCheckout && {
      gitBrokerCheckout: overrides.gitBrokerCheckout,
    }),
    ...(overrides.siteBaseUrl && { siteBaseUrl: overrides.siteBaseUrl }),
    ...(overrides.localSiteUrl && { localSiteUrl: overrides.localSiteUrl }),
    themeCSS: overrides.themeCSS ?? "",
    ...(overrides.entityDisplay && { entityDisplay: overrides.entityDisplay }),
    ...(overrides.profileKind && { profileKind: overrides.profileKind }),
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
  if (overrides.agentInstructions !== undefined)
    result.agentInstructions = overrides.agentInstructions;
  if (overrides.evalHandlerRegistry !== undefined)
    result.evalHandlerRegistry = overrides.evalHandlerRegistry;
  if (overrides.siteBaseUrl !== undefined)
    result.siteBaseUrl = overrides.siteBaseUrl;
  if (overrides.localSiteUrl !== undefined)
    result.localSiteUrl = overrides.localSiteUrl;
  if (overrides.preferLocalUrls !== undefined)
    result.preferLocalUrls = overrides.preferLocalUrls;
  result.themeCSS = overrides.themeCSS ?? "";
  if (entityDisplay !== undefined) result.entityDisplay = entityDisplay;

  return result;
}
