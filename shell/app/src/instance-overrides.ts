import { z } from "@brains/utils";
import { fromYaml } from "@brains/utils";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

/**
 * Zod schema for instance overrides parsed from brain.yaml.
 *
 * Validates the structure after YAML parsing + env interpolation.
 */
const instanceOverridesSchema = z.object({
  /** Brain package name (required) */
  brain: z.string().optional(),

  /** Override instance name */
  name: z.string().optional(),

  /** Log level */
  logLevel: z.enum(LOG_LEVELS).optional(),

  /** Production server port */
  port: z.number().optional(),

  /** Production domain */
  domain: z.string().optional(),

  /** Database URL */
  database: z.string().optional(),

  /** Plugin IDs to disable for this instance */
  disable: z.array(z.string()).optional(),

  /** Anchor users (full admin access) */
  anchors: z.array(z.string()).optional(),

  /** Trusted users (elevated access) */
  trusted: z.array(z.string()).optional(),

  /** Per-plugin config overrides, keyed by plugin ID */
  plugins: z.record(z.record(z.unknown())).optional(),

  /** Permission rules */
  permissions: z
    .object({
      anchors: z.array(z.string()).optional(),
      trusted: z.array(z.string()).optional(),
      rules: z
        .array(
          z.object({
            pattern: z.string(),
            level: z.enum(["anchor", "trusted", "public"]),
          }),
        )
        .optional(),
    })
    .optional(),
});

/**
 * Instance overrides — parsed from brain.yaml.
 *
 * These are deployment-specific settings that vary between instances
 * of the same brain model. Secrets stay in .env; everything else
 * goes here (with ${ENV_VAR} interpolation for referencing secrets).
 */
export type InstanceOverrides = z.infer<typeof instanceOverridesSchema>;

/**
 * Interpolate ${ENV_VAR} references in a string with process.env values.
 * Returns the original string if no references are found.
 * Returns undefined if an env var is not set.
 */
function interpolateEnvVar(value: string): string | undefined {
  const envVarPattern = /\$\{([^}]+)\}/g;
  let hasUnresolved = false;

  const result = value.replace(envVarPattern, (_, varName: string) => {
    const envValue = process.env[varName];
    if (envValue === undefined) {
      hasUnresolved = true;
      return "";
    }
    return envValue;
  });

  return hasUnresolved ? undefined : result;
}

/**
 * Recursively interpolate env vars in a parsed YAML object.
 * - String values: "${VAR}" → process.env.VAR
 * - Object keys: "${VAR}" → process.env.VAR (for trustedTokens map)
 * - Removes entries where env vars are not set
 */
function interpolateEnv(data: unknown): unknown {
  if (typeof data === "string") {
    return interpolateEnvVar(data);
  }

  if (Array.isArray(data)) {
    return data
      .map((item) => interpolateEnv(item))
      .filter((item) => item !== undefined);
  }

  if (typeof data === "object" && data !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Interpolate the key (for trustedTokens where key is ${TOKEN})
      const interpolatedKey = interpolateEnvVar(key);
      if (interpolatedKey === undefined) continue;

      // Interpolate the value
      const interpolatedValue = interpolateEnv(value);
      if (interpolatedValue === undefined) continue;

      result[interpolatedKey] = interpolatedValue;
    }
    return result;
  }

  return data;
}

/**
 * Parse a brain.yaml string into InstanceOverrides.
 *
 * Uses js-yaml for parsing, then interpolates ${ENV_VAR} references
 * and validates with Zod.
 */
export function parseInstanceOverrides(yamlContent: string): InstanceOverrides {
  const raw = fromYaml(yamlContent);
  const interpolated = interpolateEnv(raw);
  const parsed = instanceOverridesSchema.safeParse(interpolated);

  if (!parsed.success) {
    return {};
  }

  return parsed.data;
}
