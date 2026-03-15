import type { Plugin } from "@brains/plugins";
import type { BrainDefinition, BrainEnvironment } from "./brain-definition";
import type { AppConfig, DeploymentConfigInput } from "./types";
import type { InstanceOverrides } from "./instance-overrides";
import { defineConfig } from "./config";
import { logLevelSchema } from "./types";

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
export async function resolve(
  definition: BrainDefinition,
  env: BrainEnvironment,
  overrides?: Omit<InstanceOverrides, "brain">,
): Promise<AppConfig> {
  const disableSet = new Set(overrides?.disable ?? []);
  const pluginOverrides = await resolveAllPackageRefs(overrides?.plugins ?? {});

  // Instantiate capabilities — each plugin gets only its own
  // matching override (by plugin ID), never other plugins' overrides.
  const capabilities: Plugin[] = [];
  for (const [factory, config] of definition.capabilities) {
    const baseConfig =
      typeof config === "function" ? config(env) : (config ?? {});

    const plugin = resolvePlugin(
      (cfg) => factory(cfg),
      baseConfig,
      pluginOverrides,
      disableSet,
    );
    if (plugin) capabilities.push(plugin);
  }

  // Instantiate interfaces — same targeted-override approach.
  const interfaces: Plugin[] = [];
  for (const [ctor, envMapper] of definition.interfaces) {
    const baseConfig = envMapper(env);
    if (!baseConfig) continue;

    const plugin = resolvePlugin(
      (cfg) => new ctor(cfg),
      baseConfig,
      pluginOverrides,
      disableSet,
    );
    if (plugin) interfaces.push(plugin);
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
    yamlPerms?.anchors || yamlPerms?.trusted || yamlPerms?.rules;
  const hasTopLevel = overrides?.anchors || overrides?.trusted;
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

/**
 * Resolve @-prefixed package references in a config object.
 * Values starting with "@" are treated as package names and resolved
 * via dynamic import, replacing the string with the default export.
 */
async function resolvePackageRefs(
  config: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resolved = { ...config };
  for (const [key, value] of Object.entries(resolved)) {
    if (typeof value === "string" && value.startsWith("@")) {
      try {
        const mod = await import(value);
        resolved[key] = mod.default;
      } catch {
        // If import fails, leave the value as-is
      }
    }
  }
  return resolved;
}

/**
 * Resolve package references across all plugin override configs.
 */
async function resolveAllPackageRefs(
  pluginOverrides: Record<string, Record<string, unknown>>,
): Promise<Record<string, Record<string, unknown>>> {
  const resolved: Record<string, Record<string, unknown>> = {};
  for (const [pluginId, config] of Object.entries(pluginOverrides)) {
    resolved[pluginId] = await resolvePackageRefs(config);
  }
  return resolved;
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
function resolvePlugin(
  construct: (config: Record<string, unknown>) => Plugin,
  baseConfig: Record<string, unknown>,
  pluginOverrides: Record<string, Record<string, unknown>>,
  disableSet: Set<string>,
): Plugin | null {
  const plugin = construct(baseConfig);
  if (disableSet.has(plugin.id)) return null;

  const override = pluginOverrides[plugin.id];
  if (override) {
    return construct({ ...baseConfig, ...override });
  }

  return plugin;
}
