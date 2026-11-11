import { z } from "@brains/utils/zod";
import {
  BrainCharacterSchema,
  pluginMetadataSchema,
  type Plugin,
} from "@brains/plugins";
import {
  httpSettingsSchema,
  logLevelSchema,
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

type AppConfigSchema = z.ZodObject<{
  name: z.ZodDefault<z.ZodString>;
  version: z.ZodDefault<z.ZodString>;
  database: z.ZodOptional<z.ZodString>;
  aiApiKey: z.ZodOptional<z.ZodString>;
  aiImageKey: z.ZodOptional<z.ZodString>;
  aiModel: z.ZodOptional<z.ZodString>;
  aiEmbeddingModel: z.ZodOptional<z.ZodString>;
  aiModelRuntimeUrl: z.ZodOptional<z.ZodString>;
  aiAnswerModel: z.ZodOptional<z.ZodString>;
  aiVisionModel: z.ZodOptional<z.ZodString>;
  aiReasoningEffort: z.ZodOptional<typeof reasoningEffortSchema>;
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
  aiApiKey: z.string().optional(), // Maps to ai.apiKey in Shell
  aiImageKey: z.string().optional(), // Optional override for image generation
  aiModel: z.string().optional(), // AI model — determines provider (e.g. "gpt-4o-mini", "openai:gpt-4o")
  aiEmbeddingModel: z.string().optional(), // Embedding model, "provider:model"
  aiModelRuntimeUrl: z.string().optional(), // Model runtime serving local: models
  aiAnswerModel: z.string().optional(), // Local model answering tool results
  aiVisionModel: z.string().optional(), // Local model describing images
  aiReasoningEffort: reasoningEffortSchema.optional(),
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
