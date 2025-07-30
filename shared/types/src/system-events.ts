import { z } from "zod";

/**
 * System event schemas for plugin capability registration
 */

// Command registration event
export const systemCommandRegisterSchema = z.object({
  pluginId: z.string(),
  command: z.object({
    name: z.string(),
    description: z.string(),
    usage: z.string().optional(),
    handler: z.function(),
  }),
  timestamp: z.number(),
});

// Tool registration event
export const systemToolRegisterSchema = z.object({
  pluginId: z.string(),
  tool: z.object({
    name: z.string(),
    description: z.string(),
    inputSchema: z.record(z.unknown()), // ZodRawShape
    handler: z.function(),
    visibility: z.enum(["public", "trusted", "anchor"]).optional(),
  }),
  timestamp: z.number(),
});

// Resource registration event
export const systemResourceRegisterSchema = z.object({
  pluginId: z.string(),
  resource: z.object({
    uri: z.string(),
    name: z.string(),
    description: z.string().optional(),
    mimeType: z.string().optional(),
    handler: z.function(),
  }),
  timestamp: z.number(),
});

// Export types
export type SystemCommandRegisterEvent = z.infer<
  typeof systemCommandRegisterSchema
>;
export type SystemToolRegisterEvent = z.infer<typeof systemToolRegisterSchema>;
export type SystemResourceRegisterEvent = z.infer<
  typeof systemResourceRegisterSchema
>;
