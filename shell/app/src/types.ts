import { z } from "@brains/utils";
import { pluginMetadataSchema } from "@brains/plugins";
import type { Plugin } from "@brains/plugins";
import type { Shell } from "@brains/core";
import type { CLIConfig } from "@brains/cli";
import type { PermissionConfig } from "@brains/permission-service";
import { identityBodySchema } from "@brains/identity-service";

// Deployment configuration schema
// This consolidates all deployment settings that were previously in deploy.config.json
export const deploymentConfigSchema = z.object({
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
    .default({}),

  // Port configuration (also used by WebserverInterface)
  ports: z
    .object({
      default: z.number().default(3333),
      preview: z.number().default(4321),
      production: z.number().default(8080),
    })
    .default({}),

  // CDN configuration
  cdn: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["bunny", "none"]).default("none"),
    })
    .default({}),

  // DNS configuration
  dns: z
    .object({
      enabled: z.boolean().default(false),
      provider: z.enum(["bunny", "none"]).default("none"),
    })
    .default({}),

  // Paths (with sensible defaults based on app name)
  paths: z
    .object({
      install: z.string().optional(), // defaults to /opt/{app-name}
      data: z.string().optional(), // defaults to /opt/{app-name}/data
    })
    .default({}),
});

export type DeploymentConfig = z.infer<typeof deploymentConfigSchema>;

// Input type for deployment config (allows partial config, defaults applied by schema)
export type DeploymentConfigInput = z.input<typeof deploymentConfigSchema>;

// App config focuses on app-level concerns, plugins come from Shell
export const appConfigSchema = z.object({
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),
  // These map directly to Shell config but with simpler names
  database: z.string().optional(), // Maps to database.url in Shell
  aiApiKey: z.string().optional(), // Maps to ai.apiKey in Shell
  openaiApiKey: z.string().optional(), // Maps to ai.openaiApiKey in Shell
  googleApiKey: z.string().optional(), // Maps to ai.googleApiKey in Shell
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(), // Maps to logging.level
  // Plugins - validate metadata structure, trust the register function exists
  plugins: z.array(pluginMetadataSchema).default([]),
  // Identity - override default identity for this app
  identity: identityBodySchema.optional(),
  // Deployment configuration
  deployment: deploymentConfigSchema.default({}),
});

export type AppConfig = Omit<
  z.infer<typeof appConfigSchema>,
  "plugins" | "deployment"
> & {
  plugins?: Plugin[];
  // Deployment configuration (optional - accepts partial config, defaults applied by schema)
  deployment?: DeploymentConfigInput;
  // Advanced: Pass through any Shell config for testing/advanced use cases
  shellConfig?: Parameters<typeof Shell.createFresh>[0];
  // CLI-specific configuration (used when --cli flag is present)
  cliConfig?: CLIConfig;
  // Permissions - centralized permission configuration
  permissions?: PermissionConfig;
};
