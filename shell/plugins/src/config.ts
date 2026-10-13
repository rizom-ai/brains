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
  /**
   * The config gave no value where one is required. A custom rule that
   * requires one of several values marks itself with `params: { missing: true }`.
   */
  missing: boolean;
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  return path.reduce<unknown>(
    (value, key) =>
      typeof value === "object" && value !== null
        ? Reflect.get(value, key)
        : undefined,
    input,
  );
}

function formatValidationIssues(
  issues: readonly PluginConfigValidationIssue[],
): string {
  return issues
    .map((issue) => `${issue.path || "<root>"}: ${issue.message}`)
    .join("; ");
}

export class PluginConfigValidationError extends Error {
  public readonly pluginId: string;
  public readonly issues: readonly PluginConfigValidationIssue[];

  constructor(
    pluginId: string,
    issues: readonly PluginConfigValidationIssue[],
  ) {
    super(
      `Invalid plugin config for ${pluginId} at ${formatValidationIssues(issues)}; correct the listed fields in brain.yaml or the package's use() configuration`,
    );
    this.name = "PluginConfigValidationError";
    this.pluginId = pluginId;
    this.issues = issues;
  }

  static fromZod(
    pluginId: string,
    error: z.ZodError,
    input: unknown,
  ): PluginConfigValidationError {
    return new PluginConfigValidationError(
      pluginId,
      error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        code: issue.code,
        message: issue.message,
        missing:
          (issue.code === "custom" && issue.params?.["missing"] === true) ||
          ((issue.code === "invalid_type" || issue.code === "custom") &&
            valueAt(input, issue.path) === undefined),
      })),
    );
  }
}

/**
 * Every problem is a required value left unset, such as a credential whose
 * environment variable is absent: the plugin is not configured here, which
 * is not the same as configured wrongly.
 */
export function isMissingPluginConfig(
  error: PluginConfigValidationError,
): boolean {
  return error.issues.every((issue) => issue.missing);
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
  // Cross-bundle instanceof can fail, so the shape is checked by reflection
  // rather than asserted onto the caught error.
  return (
    typeof Reflect.get(error, "pluginId") === "string" &&
    Array.isArray(Reflect.get(error, "issues"))
  );
}
