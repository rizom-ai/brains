import { z } from "@brains/utils/zod";
import {
  BrainCharacterSchema,
  pluginMetadataSchema,
  type Plugin,
} from "@brains/plugins";
import {
  httpSettingsSchema,
  logLevelSchema,
  providerKeysSchema,
  reasoningEffortSchema,
  type Shell,
} from "@brains/core";
import type { CLIConfig } from "@brains/chat-repl";
import type { PermissionConfig } from "@brains/templates";

export { logLevelSchema, reasoningEffortSchema } from "@brains/core";
export type ReasoningEffort = z.output<typeof reasoningEffortSchema>;
export type LogLevel = z.output<typeof logLevelSchema>;

export {
  deploymentConfigSchema,
  type DeploymentConfig,
  type DeploymentConfigInput,
} from "@brains/sdk/internal/brain-config";
import {
  deploymentConfigSchema,
  type DeploymentConfig,
  type DeploymentConfigInput,
} from "@brains/sdk/internal/brain-config";

type AppAIConfigSchema = z.ZodObject<{
  providerKeys: z.ZodOptional<typeof providerKeysSchema>;
  model: z.ZodOptional<z.ZodString>;
  embeddingModel: z.ZodOptional<z.ZodString>;
  modelRuntimeUrl: z.ZodOptional<z.ZodString>;
  answerModel: z.ZodOptional<z.ZodString>;
  visionModel: z.ZodOptional<z.ZodString>;
  imageModel: z.ZodOptional<z.ZodString>;
  reasoningEffort: z.ZodOptional<typeof reasoningEffortSchema>;
}>;

/**
 * The AI settings an app gives its shell: each provider's key and the models
 * it runs, under the names the shell's `ai` block takes them.
 */
export const appAIConfigSchema: AppAIConfigSchema = z.object({
  providerKeys: providerKeysSchema.optional(),
  // The model determines its provider ("gpt-4o-mini", "openai:gpt-4o").
  model: z.string().optional(),
  embeddingModel: z.string().optional(),
  // The model runtime serving local: models.
  modelRuntimeUrl: z.string().optional(),
  // Local models answering tool results and describing images.
  answerModel: z.string().optional(),
  visionModel: z.string().optional(),
  imageModel: z.string().optional(),
  reasoningEffort: reasoningEffortSchema.optional(),
});

export type AppAIConfig = z.output<typeof appAIConfigSchema>;

type AppConfigSchema = z.ZodObject<{
  name: z.ZodDefault<z.ZodString>;
  version: z.ZodDefault<z.ZodString>;
  database: z.ZodOptional<z.ZodString>;
  ai: z.ZodOptional<AppAIConfigSchema>;
  logLevel: z.ZodOptional<typeof logLevelSchema>;
  logFile: z.ZodOptional<z.ZodString>;
  profileKind: z.ZodOptional<z.ZodString>;
  plugins: z.ZodDefault<z.ZodArray<typeof pluginMetadataSchema>>;
  spaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
  identity: z.ZodOptional<typeof BrainCharacterSchema>;
  agentInstructions: z.ZodOptional<z.ZodArray<z.ZodString>>;
  deployment: z.ZodPrefault<typeof deploymentConfigSchema>;
  http: z.ZodPrefault<typeof httpSettingsSchema>;
}>;

// App config focuses on app-level concerns, plugins come from Shell
export const appConfigSchema: AppConfigSchema = z.object({
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),
  // These map directly to Shell config but with simpler names
  database: z.string().optional(), // Maps to database.url in Shell
  ai: appAIConfigSchema.optional(), // Maps to ai in Shell
  logLevel: logLevelSchema.optional(), // Maps to logging.level
  logFile: z.string().optional(), // Maps to logging.file
  // Optional composition-selected semantic profile kind
  profileKind: z.string().trim().min(1).optional(),
  // Plugins - validate metadata structure, trust the register function exists
  plugins: z.array(pluginMetadataSchema).default([]),
  // Shared conversation spaces for this brain/team
  spaces: z.array(z.string()).default([]),
  // Identity - override default identity for this app
  identity: BrainCharacterSchema.optional(),
  // Brain-specific instructions appended to shell-neutral agent instructions
  agentInstructions: z.array(z.string()).optional(),
  // Deployment configuration
  deployment: deploymentConfigSchema.prefault({}),
  // The runtime's HTTP host; it listens on deployment.ports.production
  http: httpSettingsSchema.prefault({}),
});

type AppConfigSchemaOutput = Omit<
  z.output<typeof appConfigSchema>,
  "plugins" | "deployment" | "spaces"
>;

interface AppConfigExtensions {
  plugins?: Plugin[];
  // Advanced: Pass through any Shell config for testing/advanced use cases
  shellConfig?: Parameters<typeof Shell.createFresh>[0];
  // CLI-specific configuration (used when --cli flag is present)
  cliConfig?: CLIConfig;
  // Permissions - centralized permission configuration
  permissions?: PermissionConfig;
  // Shared conversation spaces for this brain/team
  spaces?: string[];
}

export type AppConfig = AppConfigSchemaOutput &
  AppConfigExtensions & { deployment: DeploymentConfig };

export type AppConfigInput = Partial<AppConfigSchemaOutput> &
  AppConfigExtensions & { deployment?: DeploymentConfigInput };
