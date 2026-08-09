import { z, type ZodType } from "@brains/utils/zod";

/**
 * Base configuration schema that all plugins should extend
 * Provides common fields like enabled, debug, etc.
 */
export const basePluginConfigSchema: z.ZodObject<{
  enabled: z.ZodBoolean;
  debug: z.ZodBoolean;
}> = z.object({
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

/**
 * Structural guard: separately bundled interfaces and plugins can carry their
 * own copy of this class, so `instanceof` alone misses cross-realm instances.
 */
export function isPluginConfigValidationError(
  error: unknown,
): error is PluginConfigValidationError {
  if (error instanceof PluginConfigValidationError) return true;
  if (
    !(error instanceof Error) ||
    error.name !== "PluginConfigValidationError"
  ) {
    return false;
  }
  const candidate = error as Error & { pluginId?: unknown; issues?: unknown };
  return (
    typeof candidate.pluginId === "string" && Array.isArray(candidate.issues)
  );
}
