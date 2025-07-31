import { z } from "zod";
import { pluginMetadataSchema } from "@brains/plugin-base";
import type { Plugin as OldPlugin } from "@brains/plugin-utils"; // TODO: Update when Plugin interface is migrated
import type { Plugin as NewPlugin } from "@brains/plugin-base";
import type { Shell } from "@brains/core";
import type { CLIConfig } from "@brains/cli";
import { matrixConfigSchema } from "@brains/matrix";
import { mcpConfigSchema } from "@brains/mcp";

export const interfaceConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cli"),
    enabled: z.boolean().default(true),
    config: z.any().optional(), // CLI-specific config
  }),
  z.object({
    type: z.literal("matrix"),
    enabled: z.boolean().default(true),
    config: matrixConfigSchema,
  }),
  z.object({
    type: z.literal("webserver"),
    enabled: z.boolean().default(true),
    config: z.any().optional(), // Webserver-specific config
  }),
  z.object({
    type: z.literal("mcp"),
    enabled: z.boolean().default(true),
    config: mcpConfigSchema,
  }),
]);

export type InterfaceConfig = z.infer<typeof interfaceConfigSchema>;

// App config focuses on app-level concerns, plugins come from Shell
export const appConfigSchema = z.object({
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),
  // These map directly to Shell config but with simpler names
  database: z.string().optional(), // Maps to database.url in Shell
  aiApiKey: z.string().optional(), // Maps to ai.apiKey in Shell
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(), // Maps to logging.level
  // Interface configurations (multiple interfaces can be enabled)
  interfaces: z.array(interfaceConfigSchema).default([]),
  // Plugins - validate metadata structure, trust the register function exists
  plugins: z.array(pluginMetadataSchema).default([]),
});

// During migration, support both old and new plugin interfaces
export type MigrationPlugin = OldPlugin | NewPlugin;

export type AppConfig = Omit<z.infer<typeof appConfigSchema>, "plugins"> & {
  plugins?: MigrationPlugin[]; // Support both plugin types during migration
  // Advanced: Pass through any Shell config for testing/advanced use cases
  shellConfig?: Parameters<typeof Shell.createFresh>[0];
  // CLI-specific configuration (used when --cli flag is present)
  cliConfig?: CLIConfig;
};
