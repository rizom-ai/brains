import type { Plugin } from "@brains/plugins";
import type {
  BrainDefinition,
  BrainEnvironment,
  PresetName,
} from "./brain-definition";
import type { AppConfig, DeploymentConfigInput } from "./types";
import type { InstanceOverrides } from "./instance-overrides";
import type { SitePackage } from "./site-package";
import { defineConfig } from "./config";
import { logLevelSchema } from "./types";
import { getPackage, hasPackage } from "./package-registry";

/**
 * Determine which plugin/interface IDs are active.
 *
 * Priority:
 * 1. If presets are defined: use preset (from overrides or defaultPreset),
 *    then apply add/remove
 * 2. If no presets: all IDs are active
 */
function resolveActiveIds(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): Set<string> | null {
  const allIds = new Set([
    ...definition.capabilities.map(([id]) => id),
    ...definition.interfaces.map(([id]) => id),
  ]);

  if (!definition.presets) return null;

  const presetName: PresetName =
    overrides?.preset ?? definition.defaultPreset ?? "default";
  const preset = definition.presets[presetName];

  if (!preset) {
    throw new Error(
      `Unknown preset "${presetName}". Available: ${Object.keys(definition.presets).join(", ")}`,
    );
  }

  const activeIds = new Set(preset);

  // Add: union with preset (only IDs that exist in brain definition)
  if (overrides?.add) {
    for (const id of overrides.add) {
      if (allIds.has(id)) {
        activeIds.add(id);
      }
    }
  }

  // Remove: difference from preset
  if (overrides?.remove) {
    for (const id of overrides.remove) {
      activeIds.delete(id);
    }
  }

  return activeIds;
}

/**
 * Resolve a brain definition + environment into a runnable AppConfig.
 *
 * Each call creates fresh plugin and interface instances from the
 * definition's factories. This means the same definition can be
 * resolved multiple times with different environments to produce
 * independent brain instances.
 *
 * @param definition - The brain model (what the brain IS)
 * @param env - The deployment environment (secrets)
 * @param overrides - Instance overrides from brain.yaml (optional)
 * @returns A fully resolved AppConfig ready for handleCLI() or App.create()
 */
export function resolve(
  definition: BrainDefinition,
  env: BrainEnvironment,
  overrides?: Omit<InstanceOverrides, "brain">,
): AppConfig {
  const activeIds = resolveActiveIds(definition, overrides);
  const pluginOverrides = resolveAllPackageRefs(overrides?.plugins ?? {});

  // Resolve site package: brain.yaml `site` overrides brain definition default
  const site: SitePackage | undefined = resolveSitePackage(
    definition,
    overrides,
  );

  // If a site package is present, inject its config into site-builder overrides
  if (site) {
    const siteBuilderExplicit = pluginOverrides["site-builder"] ?? {};
    pluginOverrides["site-builder"] = {
      // Site package provides defaults
      themeCSS: site.theme,
      routes: site.routes,
      entityRouteConfig: site.entityRouteConfig,
      layouts: site.layouts,
      // Explicit brain.yaml site-builder overrides win
      ...siteBuilderExplicit,
    };
  }

  // Instantiate capabilities — each plugin gets only its own
  // matching override (by plugin ID), never other plugins' overrides.
  const capabilities: Plugin[] = [];

  // If a site package is present, register its plugin
  if (site) {
    const sitePlugin = site.plugin({
      entityRouteConfig: site.entityRouteConfig,
    });
    // Register site plugin when site-builder is active (site plugin
    // is part of the site package, not listed in presets directly)
    if (!activeIds || activeIds.has("site-builder")) {
      capabilities.push(sitePlugin);
    }
  }

  for (const [id, factory, config] of definition.capabilities) {
    if (activeIds && !activeIds.has(id)) continue;

    const baseConfig =
      typeof config === "function" ? config(env) : (config ?? {});
    const override = pluginOverrides[id];
    const merged = override ? { ...baseConfig, ...override } : baseConfig;
    capabilities.push(factory(merged));
  }

  // Instantiate interfaces
  const interfaces: Plugin[] = [];
  for (const [id, ctor, envMapper] of definition.interfaces) {
    if (activeIds && !activeIds.has(id)) continue;

    const baseConfig = envMapper(env);
    if (!baseConfig) continue;

    const override = pluginOverrides[id];
    const merged = override ? { ...baseConfig, ...override } : baseConfig;
    interfaces.push(new ctor(merged));
  }

  // Map identity to the format AppConfig expects

  const identity = definition.identity
    ? {
        name: definition.identity.characterName,
        role: definition.identity.role,
        purpose: definition.identity.purpose,
        values: definition.identity.values,
      }
    : undefined;

  // Start with definition's deployment config, apply overrides
  const deployment: DeploymentConfigInput = {
    ...(definition.deployment ?? {}),
  };
  if (overrides?.domain) {
    deployment.domain = overrides.domain;
  }
  if (overrides?.port) {
    deployment.ports = {
      ...(deployment.ports ?? {}),
      production: overrides.port,
    };
  }

  // Build the app config
  const appConfig: AppConfig = {
    name: overrides?.name ?? definition.name,
    version: definition.version,
    plugins: [...capabilities, ...interfaces],

    // AI keys from environment
    aiApiKey: env["ANTHROPIC_API_KEY"],
    openaiApiKey: env["OPENAI_API_KEY"],
    googleApiKey: env["GOOGLE_GENERATIVE_AI_API_KEY"],

    // Optional fields
    ...(identity && { identity }),
    ...buildPermissions(definition.permissions, overrides),
    deployment,

    // Log level: yaml overrides > env > undefined
    ...(overrides?.logLevel
      ? { logLevel: overrides.logLevel }
      : logLevelSchema.safeParse(env["LOG_LEVEL"]).success
        ? { logLevel: logLevelSchema.parse(env["LOG_LEVEL"]) }
        : {}),

    // Database: yaml overrides > env > undefined
    ...(overrides?.database
      ? { database: overrides.database }
      : env["DATABASE_URL"]
        ? { database: env["DATABASE_URL"] }
        : {}),
  };

  // Merge any extra config (escape hatch)
  if (definition.extra) {
    Object.assign(appConfig, definition.extra);
  }

  return defineConfig(appConfig);
}

/**
 * Build the permissions config by merging definition defaults with yaml overrides.
 *
 * Priority: yaml `permissions` section > yaml top-level `anchors`/`trusted` > definition defaults
 */
function buildPermissions(
  definitionPerms: BrainDefinition["permissions"],
  overrides?: Omit<InstanceOverrides, "brain">,
): { permissions: Record<string, unknown> } | Record<string, never> {
  const yamlPerms = overrides?.permissions;
  const hasYamlPerms =
    yamlPerms?.anchors ?? yamlPerms?.trusted ?? yamlPerms?.rules;
  const hasTopLevel = overrides?.anchors ?? overrides?.trusted;
  const hasDefPerms = !!definitionPerms;

  if (!hasYamlPerms && !hasTopLevel && !hasDefPerms) return {};

  return {
    permissions: {
      ...(definitionPerms ?? {}),
      // Top-level anchors/trusted (legacy path)
      ...(overrides?.anchors && { anchors: overrides.anchors }),
      ...(overrides?.trusted && { trusted: overrides.trusted }),
      // yaml permissions section takes priority
      ...(yamlPerms?.anchors && { anchors: yamlPerms.anchors }),
      ...(yamlPerms?.trusted && { trusted: yamlPerms.trusted }),
      ...(yamlPerms?.rules && { rules: yamlPerms.rules }),
    },
  };
}

/** Matches scoped npm package names like @brains/theme-rizom (no colons, no dots) */
const SCOPED_PACKAGE_PATTERN = /^@[\w-]+\/[\w-]+$/;

/**
 * Check if a string looks like a scoped npm package reference.
 * Excludes Matrix userIds (@user:server), email addresses, CSS selectors, etc.
 */
export function isScopedPackageRef(value: string): boolean {
  return SCOPED_PACKAGE_PATTERN.test(value);
}

/**
 * Resolve scoped package references in a config object.
 * Looks up values in the package registry (populated before resolve() is called).
 */
function resolvePackageRefs(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const resolved = { ...config };
  for (const [key, value] of Object.entries(resolved)) {
    if (
      typeof value === "string" &&
      isScopedPackageRef(value) &&
      hasPackage(value)
    ) {
      resolved[key] = getPackage(value);
    }
  }
  return resolved;
}

/**
 * Resolve package references across all plugin override configs.
 */
function resolveAllPackageRefs(
  pluginOverrides: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const resolved: Record<string, Record<string, unknown>> = {};
  for (const [pluginId, config] of Object.entries(pluginOverrides)) {
    resolved[pluginId] = resolvePackageRefs(config);
  }
  return resolved;
}
/**
 * Resolve the site package from brain.yaml override or brain definition default.
 * brain.yaml `site` (a @-prefixed package ref) takes priority.
 */
function resolveSitePackage(
  definition: BrainDefinition,
  overrides?: Omit<InstanceOverrides, "brain">,
): SitePackage | undefined {
  if (overrides?.site && hasPackage(overrides.site)) {
    return getPackage(overrides.site) as SitePackage;
  }
  return definition.site;
}

/**
 * Construct a plugin with targeted override matching.
 *
 * 1. Construct with base config → get plugin.id
 * 2. If disabled → skip
 * 3. If a matching override exists → reconstruct with merged config
 *
 * Only the override keyed by the plugin's own ID is applied,
 * so overrides for other plugins never leak in.
 */
