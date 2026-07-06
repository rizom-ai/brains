import { z } from "@brains/utils/zod-v4";
import type { Plugin } from "@brains/plugins";
import type { Shell } from "@brains/core";
import type { CLIConfig } from "@brains/chat-repl";
import type { PermissionConfig } from "@brains/templates";

interface PluginMetadata {
  id: string;
  version: string;
  type: "core" | "entity" | "service" | "interface";
  description?: string | undefined;
  dependencies?: string[] | undefined;
  packageName: string;
}

const pluginMetadataSchema: z.ZodType<PluginMetadata> = z.object({
  id: z.string(),
  version: z.string(),
  type: z.enum(["core", "entity", "service", "interface"]),
  description: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  packageName: z.string(),
});

interface AppIdentity {
  name: string;
  role: string;
  purpose: string;
  values: string[];
}

const appIdentitySchema: z.ZodType<AppIdentity> = z.object({
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
export type LogLevel = z.output<typeof logLevelSchema>;

export interface DeploymentConfig {
  provider: "hetzner" | "docker";
  serverSize: string;
  location: string;
  domain?: string | undefined;
  docker: {
    enabled: boolean;
    image?: string | undefined;
  };
  ports: {
    default: number;
    preview: number;
    production: number;
  };
  cdn: {
    enabled: boolean;
    provider: "bunny" | "none";
  };
  dns: {
    enabled: boolean;
    provider: "bunny" | "none";
  };
  paths: {
    install?: string | undefined;
    data?: string | undefined;
  };
}

export interface DeploymentConfigInput {
  provider?: "hetzner" | "docker" | undefined;
  serverSize?: string | undefined;
  location?: string | undefined;
  domain?: string | undefined;
  docker?:
    | {
        enabled?: boolean | undefined;
        image?: string | undefined;
      }
    | undefined;
  ports?:
    | {
        default?: number | undefined;
        preview?: number | undefined;
        production?: number | undefined;
      }
    | undefined;
  cdn?:
    | {
        enabled?: boolean | undefined;
        provider?: "bunny" | "none" | undefined;
      }
    | undefined;
  dns?:
    | {
        enabled?: boolean | undefined;
        provider?: "bunny" | "none" | undefined;
      }
    | undefined;
  paths?:
    | {
        install?: string | undefined;
        data?: string | undefined;
      }
    | undefined;
}

// Deployment configuration schema
// This consolidates all deployment settings that were previously in deploy.config.json
export const deploymentConfigSchema: z.ZodType<
  DeploymentConfig,
  DeploymentConfigInput
> = z.object({
  // Server configuration
  provider: z.enum(["hetzner", "docker"]).default("hetzner"),
  serverSize: z.string().default("cx33"),
  location: z.string().default("fsn1"),

  // Domain
  domain: z.string().optional(),

  // Docker configuration
  docker: z
    .object({
      enabled: z.boolean().default(true),
      image: z.string().optional(), // defaults to app name
    })
    .prefault({}),

  // Port configuration (also used by WebserverInterface)
  ports: z
    .object({
      default: z.number().default(3333),
      preview: z.number().default(4321),
      production: z.number().default(8080),
    })
    .prefault({}),

  // CDN configuration
  cdn: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["bunny", "none"]).default("none"),
    })
    .prefault({}),

  // DNS configuration
  dns: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["bunny", "none"]).default("none"),
    })
    .prefault({}),

  // Paths (with sensible defaults based on app name)
  paths: z
    .object({
      install: z.string().optional(), // defaults to /opt/{app-name}
      data: z.string().optional(), // defaults to /opt/{app-name}/data
    })
    .prefault({}),
});

interface AppConfigSchemaRaw {
  name: string;
  version: string;
  database?: string | undefined;
  aiApiKey?: string | undefined;
  aiImageKey?: string | undefined;
  aiModel?: string | undefined;
  logLevel?: LogLevel | undefined;
  logFile?: string | undefined;
  plugins: PluginMetadata[];
  spaces: string[];
  identity?: AppIdentity | undefined;
  agentInstructions?: string[] | undefined;
  deployment: DeploymentConfig;
}

// App config focuses on app-level concerns, plugins come from Shell
export const appConfigSchema: z.ZodType<AppConfigSchemaRaw> = z.object({
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),
  // These map directly to Shell config but with simpler names
  database: z.string().optional(), // Maps to database.url in Shell
  aiApiKey: z.string().optional(), // Maps to ai.apiKey in Shell
  aiImageKey: z.string().optional(), // Optional override for image generation
  aiModel: z.string().optional(), // AI model — determines provider (e.g. "gpt-4o-mini", "openai:gpt-4o")
  logLevel: logLevelSchema.optional(), // Maps to logging.level
  logFile: z.string().optional(), // Maps to logging.file
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
  AppConfigSchemaRaw,
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
