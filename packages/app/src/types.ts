import { z } from "zod";
import type { Plugin } from "@brains/types";
import type { Shell } from "@brains/shell";
import type { BaseInterface } from "@brains/interface-core";

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
  }),
  z.object({
    type: z.literal("matrix"),
    homeserver: z.string(),
    accessToken: z.string(),
    userId: z.string(),
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
  // Interface configuration
  interface: interfaceConfigSchema.optional(),
});

export type AppConfig = z.infer<typeof appConfigSchema> & {
  plugins?: Plugin[]; // Optional plugins array, same type as Shell expects
  // Advanced: Pass through any Shell config for testing/advanced use cases
  shellConfig?: Parameters<typeof Shell.createFresh>[0];
  // Custom interface implementation
  customInterface?: BaseInterface;
};
