import { z, parseYamlDocument, interpolateEnv } from "@brains/utils";
import { presetNameSchema, modeSchema } from "./brain-definition";
import { logLevelSchema } from "./types";

/**
 * Zod schema for instance overrides parsed from brain.yaml.
 *
 * Validates the structure after YAML parsing + env interpolation.
 */
const pluginConfigOverrideSchema = z.record(z.unknown());

const externalPluginDeclarationSchema = z
  .object({
    /** npm package name to import from node_modules */
    package: z.string().min(1),
    /** Config object passed to the external plugin factory */
    config: z.record(z.unknown()).optional(),
  })
  .strict();

const pluginOverrideEntrySchema = pluginConfigOverrideSchema.superRefine(
  (entry, ctx) => {
    if (typeof entry["package"] !== "string") return;

    const parsed = externalPluginDeclarationSchema.safeParse(entry);
    if (!parsed.success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'external plugin declarations may only contain "package" and optional nested "config"',
      });
    }
  },
);

const instanceOverridesSchema = z.object({
  /** Brain package name (required) */
  brain: z.string().optional(),

  /**
   * Site and theme overrides.
   *
   * - `package` names the site package to load (e.g. `@brains/site-default`).
   *   Overrides any `site` set by the brain definition.
   * - `variant` is forwarded to the site plugin's config schema, so a
   *   single site package can ship multiple structural flavors
   *   (for example a wrapper or multi-flavor site package).
   * - `theme` selects the base theme package or inline CSS string to use
   *   for styling. It is resolved separately from the site plugin.
   * - `themeOverride` appends extra CSS after the base theme. This is used
   *   by the local `src/theme.css` convention so apps can layer local theme
   *   overrides on top of a shared base theme without forking it.
   *
   * The whole block is optional; any subfield is optional.
   */
  site: z
    .object({
      package: z.string().optional(),
      variant: z.string().optional(),
      theme: z.string().optional(),
      themeOverride: z.string().optional(),
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

  /**
   * Per-plugin config overrides and external plugin declarations, keyed by plugin ID.
   *
   * Existing built-in override shape remains:
   *   plugins.directory-sync.git.repo: ...
   *
   * External packages reserve `package` and optional nested `config`:
   *   plugins.calendar.package: "@rizom/brain-plugin-calendar"
   *   plugins.calendar.config.apiKey: "${CALENDAR_API_KEY}"
   */
  plugins: z.record(pluginOverrideEntrySchema).optional(),

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
export type ExternalPluginDeclaration = z.infer<
  typeof externalPluginDeclarationSchema
>;
export type PluginConfigOverride = Record<string, unknown>;
export type PluginOverrideEntry =
  | PluginConfigOverride
  | ExternalPluginDeclaration;
export type InstanceOverrides = z.infer<typeof instanceOverridesSchema>;

export function isExternalPluginDeclaration(
  entry: PluginOverrideEntry | undefined,
): entry is ExternalPluginDeclaration {
  return (
    !!entry &&
    typeof entry === "object" &&
    !Array.isArray(entry) &&
    typeof (entry as Record<string, unknown>)["package"] === "string" &&
    (Object.keys(entry).length === 1 ||
      (Object.keys(entry).length === 2 &&
        Object.prototype.hasOwnProperty.call(entry, "config")))
  );
}

/** Return only built-in plugin config overrides, excluding external packages. */
export function getPluginConfigOverrides(
  plugins: InstanceOverrides["plugins"] | undefined,
): Record<string, PluginConfigOverride> {
  const result: Record<string, PluginConfigOverride> = {};
  for (const [id, entry] of Object.entries(plugins ?? {})) {
    if (!isExternalPluginDeclaration(entry)) {
      result[id] = entry;
    }
  }
  return result;
}

/** Return only external plugin package declarations. */
export function getExternalPluginDeclarations(
  plugins: InstanceOverrides["plugins"] | undefined,
): Record<string, ExternalPluginDeclaration> {
  const result: Record<string, ExternalPluginDeclaration> = {};
  for (const [id, entry] of Object.entries(plugins ?? {})) {
    if (isExternalPluginDeclaration(entry)) {
      result[id] = entry;
    }
  }
  return result;
}

export const CONVENTIONAL_SITE_PACKAGE_REF = "@brains/local-site";
export const CONVENTIONAL_THEME_PACKAGE_REF = "@brains/local-theme";
export const CONVENTIONAL_SITE_CONTENT_PACKAGE_REF =
  "@brains/local-site-content";

/**
 * Apply convention-discovered local authoring refs only when brain.yaml does
 * not explicitly choose them.
 *
 * `themeOverrideRef` is additive: it layers local theme CSS after the base
 * theme from `site.theme` or the brain definition's default theme.
 *
 * `siteContentDefinitionsRef` wires app-local `src/site-content.ts` into the
 * `site-content` plugin config when that plugin does not already define a
 * `definitions` value explicitly.
 */
export function applyConventionalSiteRefs(
  overrides: InstanceOverrides,
  conventions: {
    sitePackageRef?: string;
    themeRef?: string;
    themeOverrideRef?: string;
    siteContentDefinitionsRef?: string;
  },
): InstanceOverrides {
  if (
    !conventions.sitePackageRef &&
    !conventions.themeRef &&
    !conventions.themeOverrideRef &&
    !conventions.siteContentDefinitionsRef
  ) {
    return overrides;
  }

  const site = { ...(overrides.site ?? {}) };

  if (!site.package && conventions.sitePackageRef) {
    site.package = conventions.sitePackageRef;
  }

  if (!site.theme && conventions.themeRef) {
    site.theme = conventions.themeRef;
  }

  if (!site.themeOverride && conventions.themeOverrideRef) {
    site.themeOverride = conventions.themeOverrideRef;
  }

  const plugins = { ...(overrides.plugins ?? {}) };
  const siteContentConfig = { ...(plugins["site-content"] ?? {}) };

  if (
    siteContentConfig["definitions"] === undefined &&
    conventions.siteContentDefinitionsRef
  ) {
    siteContentConfig["definitions"] = conventions.siteContentDefinitionsRef;
  }

  if (Object.keys(siteContentConfig).length > 0) {
    plugins["site-content"] = siteContentConfig;
  }

  return {
    ...overrides,
    ...(Object.keys(site).length > 0 ? { site } : {}),
    ...(Object.keys(plugins).length > 0 ? { plugins } : {}),
  };
}

/**
 * Strip site fields consumed by the resolver before constructing the
 * site plugin config.
 *
 * - `package` is consumed by site-package resolution
 * - `theme` and `themeOverride` are consumed by theme resolution
 *
 * Remaining fields (for example `variant`) flow into the site plugin's
 * own config schema.
 */
export function stripSiteConfig(
  site: NonNullable<InstanceOverrides["site"]> | undefined,
): Omit<
  NonNullable<InstanceOverrides["site"]>,
  "package" | "theme" | "themeOverride"
> {
  const {
    package: _pkg,
    theme: _theme,
    themeOverride: _themeOverride,
    ...config
  } = site ?? {};
  return config;
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
