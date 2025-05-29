import { z } from "zod";
import type { ShellConfig } from "@brains/shell";

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

export const appConfigSchema = z.object({
  name: z.string().default("brain-app"),
  version: z.string().default("1.0.0"),
  transport: transportConfigSchema.default({ type: "stdio" }),
  dbPath: z.string().optional(),
  pluginPaths: z.array(z.string()).default([]),
  shellConfig: z.custom<Partial<ShellConfig>>().optional(),
});

export type AppConfig = z.infer<typeof appConfigSchema>;