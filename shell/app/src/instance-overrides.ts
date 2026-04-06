import { z, parseYamlDocument, interpolateEnv } from "@brains/utils";
import { presetNameSchema, modeSchema } from "./brain-definition";
import { logLevelSchema } from "./types";

/**
 * Zod schema for instance overrides parsed from brain.yaml.
 *
 * Validates the structure after YAML parsing + env interpolation.
 */
const instanceOverridesSchema = z.object({
  /** Brain package name (required) */
  brain: z.string().optional(),

  /**
   * Site package override.
   *
   * - `package` names the site package to load (e.g. `@brains/site-rizom`).
   *   Overrides any `site` set by the brain definition.
   * - `variant` and `theme` are forwarded to the site plugin's config
   *   schema, so a single site package can ship multiple flavors
   *   (e.g. site-rizom with variant: foundation | work | ai).
   *
   * The whole block is optional; any subfield is optional.
   */
  site: z
    .object({
      package: z.string().optional(),
      variant: z.string().optional(),
      theme: z.string().optional(),
    })
    .optional(),

  /** Override instance name */
  name: z.string().optional(),

  /** Log level */
  logLevel: logLevelSchema.optional(),

  /** Log file path (enables usage tracking) */
  logFile: z.string().optional(),

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
 * Strip the `package` field from a site override, leaving only the flavor
 * fields (variant, theme, ...) that flow into the site plugin's factory.
 * `package` is consumed at package-resolution time and must not leak into
 * the plugin config.
 */
export function stripSitePackageRef(
  site: NonNullable<InstanceOverrides["site"]> | undefined,
): Omit<NonNullable<InstanceOverrides["site"]>, "package"> {
  const { package: _pkg, ...flavor } = site ?? {};
  return flavor;
}

/**
 * Error thrown when brain.yaml fails to parse or validate.
 *
 * The message is pre-formatted for direct display to the operator
 * (multi-line, includes actionable context).
 */
export class InstanceOverridesParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstanceOverridesParseError";
  }
}

/**
 * Recursively strip `null` values from an object/array structure.
 *
 * YAML has no way to spell "undefined", and empty mapping values
 * (`anchors:` with nothing after the colon) parse as `null`. The
 * Zod schema uses `.optional()` which only accepts `undefined`, so
 * without this preprocessing an empty field would invalidate the
 * entire overrides object.
 *
 * Semantics: `key: null` / `key:` in YAML is treated as "key is not
 * set". If you want an explicit empty array or object, spell it
 * (`key: []` or `key: {}`).
 */
function nullsToUndefined(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => nullsToUndefined(v)).filter((v) => v !== undefined);
  }
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const converted = nullsToUndefined(v);
      if (converted !== undefined) {
        result[k] = converted;
      }
    }
    return result;
  }
  return value;
}

/**
 * Format a Zod error's issues into an operator-readable multi-line
 * message. Example:
 *
 *   invalid brain.yaml:
 *     - anchors: Expected array, received string
 *     - plugins.mcp.port: Expected number, received string
 */
function formatZodIssues(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `  - ${path}: ${issue.message}`;
  });
  return `invalid brain.yaml:\n${lines.join("\n")}`;
}

/**
 * Parse a brain.yaml string into InstanceOverrides.
 *
 * Pipeline: YAML parse → env interpolation → null-strip → Zod validate.
 *
 * Throws {@link InstanceOverridesParseError} with a pre-formatted
 * message if any step fails. Callers should catch it and either
 * surface the message to the operator or exit with a clear error.
 *
 * Previously this function silently returned `{}` on any failure,
 * which meant a typo or an empty YAML field could cause _all_
 * instance overrides to be discarded without any operator-visible
 * signal — producing a brain that booted with completely wrong
 * config. Failing loud is a deliberate choice.
 */
export function parseInstanceOverrides(yamlContent: string): InstanceOverrides {
  const yamlResult = parseYamlDocument(yamlContent);
  if (!yamlResult.ok) {
    throw new InstanceOverridesParseError(
      `failed to parse brain.yaml: ${yamlResult.error}`,
    );
  }

  const interpolated = interpolateEnv(yamlResult.data);
  const normalized = nullsToUndefined(interpolated);
  const parsed = instanceOverridesSchema.safeParse(normalized);

  if (!parsed.success) {
    throw new InstanceOverridesParseError(formatZodIssues(parsed.error));
  }

  return parsed.data;
}
