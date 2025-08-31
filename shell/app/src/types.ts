import { z } from "@brains/utils";
import { pluginMetadataSchema } from "@brains/plugins";
import type { Plugin } from "@brains/plugins";
import type { Shell } from "@brains/core";
import type { CLIConfig } from "@brains/cli";
import type { PermissionConfig } from "@brains/permission-service";

// App config focuses on app-level concerns, plugins come from Shell
export const appConfigSchema = z.object({
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),
  // These map directly to Shell config but with simpler names
  database: z.string().optional(), // Maps to database.url in Shell
  aiApiKey: z.string().optional(), // Maps to ai.apiKey in Shell
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(), // Maps to logging.level
  // Plugins - validate metadata structure, trust the register function exists
  plugins: z.array(pluginMetadataSchema).default([]),
});

export type AppConfig = Omit<z.infer<typeof appConfigSchema>, "plugins"> & {
  plugins?: Plugin[];
  // Advanced: Pass through any Shell config for testing/advanced use cases
  shellConfig?: Parameters<typeof Shell.createFresh>[0];
  // CLI-specific configuration (used when --cli flag is present)
  cliConfig?: CLIConfig;
  // Permissions - centralized permission configuration
  permissions?: PermissionConfig;
};
