import { z, type ZodType } from "@brains/utils/zod";

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
export type PluginConfigSchema<TConfig> = ZodType<TConfig, unknown>;
export type PluginConfigInput<T extends ZodType> = z.input<T>;
export type PluginConfig<T extends ZodType> = z.output<T>;

export interface PluginConfigValidationIssue {
  path: string;
  code: string;
  message: string;
}

export class PluginConfigValidationError extends Error {
  public readonly pluginId: string;
  public readonly issues: readonly PluginConfigValidationIssue[];

  constructor(
    pluginId: string,
    issues: readonly PluginConfigValidationIssue[],
  ) {
    super(`Invalid plugin config for ${pluginId}`);
    this.name = "PluginConfigValidationError";
    this.pluginId = pluginId;
    this.issues = issues;
  }
}
