import { z, fromYaml, interpolateEnv } from "@brains/utils";
import { presetNameSchema, modeSchema } from "./brain-definition";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

/**
 * Zod schema for instance overrides parsed from brain.yaml.
 *
 * Validates the structure after YAML parsing + env interpolation.
 */
const instanceOverridesSchema = z.object({
  /** Brain package name (required) */
  brain: z.string().optional(),

  /** Site package — bundles theme, layout, routes, and site plugin */
  site: z.string().optional(),

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

  /** AI model — determines provider. e.g. "gpt-4o-mini", "claude-haiku-4-5", "openai:gpt-4o" */
  model: z.string().optional(),

  /** Preset name — selects a curated subset of capabilities + interfaces */
  preset: presetNameSchema.optional(),

  /** Eval mode — disables plugins with side effects (defined by evalDisable in brain model) */
  mode: modeSchema.optional(),

  /** Plugin/interface IDs to add on top of the preset */
  add: z.array(z.string()).optional(),

  /** Plugin/interface IDs to remove from the preset */
  remove: z.array(z.string()).optional(),

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
 * Parse a brain.yaml string into InstanceOverrides.
 *
 * Uses js-yaml for parsing, then interpolates ${ENV_VAR} references
 * and validates with Zod.
 */
export function parseInstanceOverrides(yamlContent: string): InstanceOverrides {
  let raw: unknown;
  try {
    raw = fromYaml(yamlContent);
  } catch {
    return {};
  }

  const interpolated = interpolateEnv(raw);
  const parsed = instanceOverridesSchema.safeParse(interpolated);

  return parsed.success ? parsed.data : {};
}
