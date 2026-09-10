import { z } from "@brains/utils/zod";
import type { Plugin } from "@brains/plugins";
import type { Shell } from "@brains/core";
import type { CLIConfig } from "@brains/chat-repl";
import type { PermissionConfig } from "@brains/templates";

const pluginMetadataSchema: z.ZodObject<{
  id: z.ZodString;
  version: z.ZodString;
  type: z.ZodEnum<{
    core: "core";
    entity: "entity";
    service: "service";
    interface: "interface";
  }>;
  description: z.ZodOptional<z.ZodString>;
  dependencies: z.ZodOptional<z.ZodArray<z.ZodString>>;
  packageName: z.ZodString;
}> = z.object({
  id: z.string(),
  version: z.string(),
  type: z.enum(["core", "entity", "service", "interface"]),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  packageName: z.string(),
});

const appIdentitySchema: z.ZodObject<{
  name: z.ZodString;
  role: z.ZodString;
  purpose: z.ZodString;
  values: z.ZodArray<z.ZodString>;
}> = z.object({
  name: z.string(),
  role: z.string(),
  purpose: z.string(),
  values: z.array(z.string()),
});

// Log level schema — shared between AppConfig and brain-resolver
export const logLevelSchema: z.ZodEnum<{
  debug: "debug";
  info: "info";
  warn: "warn";
  error: "error";
}> = z.enum(["debug", "info", "warn", "error"]);

import {
  deploymentConfigSchema,
  reasoningEffortSchema,
  type DeploymentConfig,
  type DeploymentConfigInput,
} from "@brains/sdk/internal/brain-config";
export {
  deploymentConfigSchema,
  reasoningEffortSchema,
  type DeploymentConfig,
  type DeploymentConfigInput,
  type ReasoningEffort,
} from "@brains/sdk/internal/brain-config";
export type LogLevel = z.output<typeof logLevelSchema>;

import { httpConfigSchema } from "@brains/plugins/contracts/http-host";

type AppConfigSchema = z.ZodObject<{
  http: z.ZodOptional<typeof httpConfigSchema>;
  name: z.ZodDefault<z.ZodString>;
  version: z.ZodDefault<z.ZodString>;
  database: z.ZodOptional<z.ZodString>;
  aiApiKey: z.ZodOptional<z.ZodString>;
  aiImageKey: z.ZodOptional<z.ZodString>;
  aiModel: z.ZodOptional<z.ZodString>;
  aiReasoningEffort: z.ZodOptional<typeof reasoningEffortSchema>;
  logLevel: z.ZodOptional<typeof logLevelSchema>;
  logFile: z.ZodOptional<z.ZodString>;
  profileKind: z.ZodOptional<z.ZodString>;
  plugins: z.ZodDefault<z.ZodArray<typeof pluginMetadataSchema>>;
  spaces: z.ZodDefault<z.ZodArray<z.ZodString>>;
  identity: z.ZodOptional<typeof appIdentitySchema>;
  agentInstructions: z.ZodOptional<z.ZodArray<z.ZodString>>;
  deployment: z.ZodPrefault<typeof deploymentConfigSchema>;
}>;

// App config focuses on app-level concerns, plugins come from Shell
export const appConfigSchema: AppConfigSchema = z.object({
  http: httpConfigSchema.optional(),
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),
  // These map directly to Shell config but with simpler names
  database: z.string().optional(), // Maps to database.url in Shell
  aiApiKey: z.string().optional(), // Maps to ai.apiKey in Shell
  aiImageKey: z.string().optional(), // Optional override for image generation
  aiModel: z.string().optional(), // AI model — determines provider (e.g. "gpt-4o-mini", "openai:gpt-4o")
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
  identity: appIdentitySchema.optional(),
  // Brain-specific instructions appended to shell-neutral agent instructions
  agentInstructions: z.array(z.string()).optional(),
  // Deployment configuration
  deployment: deploymentConfigSchema.prefault({}),
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
