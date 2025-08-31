import { z } from "@brains/utils";

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
export type PluginConfigInput<T extends z.ZodType> = z.input<T>;
export type PluginConfig<T extends z.ZodType> = z.infer<T>;
