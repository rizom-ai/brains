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
 * Validate plugin configuration with helpful error messages
 */
export function validatePluginConfig<TOutput, TInput = TOutput>(
  schema: z.ZodType<TOutput, z.ZodTypeDef, TInput>,
  config: TInput,
  pluginName: string,
): TOutput {
  try {
    return schema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.errors
        .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
        .join("\n");

      throw new Error(
        `Invalid configuration for ${pluginName} plugin:\n${issues}`,
      );
    }
    throw error;
  }
}

/**
 * Helper to merge configuration with defaults
 */
export function mergePluginConfig<T>(
  defaults: Partial<T>,
  userConfig?: Partial<T>,
): T {
  return { ...defaults, ...userConfig } as T;
}

/**
 * Type helpers for plugin configuration
 */
export type PluginConfigInput<T extends z.ZodType> = z.input<T>;
export type PluginConfig<T extends z.ZodType> = z.infer<T>;
