import { z, type ZodType } from "@brains/utils/zod-v4";

/**
 * Base configuration schema that all plugins should extend
 * Provides common fields like enabled, debug, etc.
 */
export const basePluginConfigSchema = z.object({
  enabled: z.boolean().describe("Whether the plugin is enabled"),
  debug: z.boolean().describe("Enable debug logging for this plugin"),
});

/**
 * Type helpers for plugin configuration
 */
export type PluginConfigInput<T extends ZodType> = z.input<T>;
export type PluginConfig<T extends ZodType> = z.output<T>;
