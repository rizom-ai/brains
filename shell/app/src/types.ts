import { z } from "zod";
import { pluginMetadataSchema, type Plugin } from "@brains/plugin-utils";
import type { Shell } from "@brains/core";
import type { BaseInterface } from "@brains/interface-core";
import type { CLIConfig } from "@brains/cli";
import { matrixConfigSchema } from "@brains/matrix";

export const transportConfigSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("stdio"),
  }),
  z.object({
    type: z.literal("http"),
    port: z.number().default(3000),
    host: z.string().default("localhost"),
  }),
]);

export type TransportConfig = z.infer<typeof transportConfigSchema>;

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
]);

export type InterfaceConfig = z.infer<typeof interfaceConfigSchema>;

// App config focuses on app-level concerns, plugins come from Shell
export const appConfigSchema = z.object({
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),
  transport: transportConfigSchema.default({ type: "stdio" }),
  // These map directly to Shell config but with simpler names
  database: z.string().optional(), // Maps to database.url in Shell
  aiApiKey: z.string().optional(), // Maps to ai.apiKey in Shell
  logLevel: z.enum(["debug", "info", "warn", "error"]).optional(), // Maps to logging.level
  // Interface configurations (multiple interfaces can be enabled)
  interfaces: z.array(interfaceConfigSchema).default([]),
  // Plugins - validate metadata structure, trust the register function exists
  plugins: z.array(pluginMetadataSchema).default([]),
});

export type AppConfig = Omit<z.infer<typeof appConfigSchema>, "plugins"> & {
  plugins?: Plugin[]; // Optional plugins array, same type as Shell expects
  // Advanced: Pass through any Shell config for testing/advanced use cases
  shellConfig?: Parameters<typeof Shell.createFresh>[0];
  // Custom interface implementations
  customInterfaces?: BaseInterface[];
  // CLI-specific configuration (used when --cli flag is present)
  cliConfig?: CLIConfig;
};
