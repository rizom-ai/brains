import type { Plugin } from "@brains/plugins";
import type {
  BrainDefinition,
  BrainEnvironment,
  PluginConfig,
} from "./brain-definition";
import type { AppConfig, DeploymentConfigInput } from "./types";
import type { InstanceOverrides } from "./instance-overrides";
import { defineConfig } from "./config";

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
  const disableSet = new Set(overrides?.disable ?? []);
  const pluginOverrides = overrides?.plugins ?? {};

  // Instantiate capabilities — fresh plugin instances every time
  // Merge overrides before construction so Zod validation sees the full config.
  const capabilities: Plugin[] = [];
  for (const [factory, config] of definition.capabilities) {
    const baseConfig =
      typeof config === "function" ? config(env) : (config ?? {});
    const merged = mergeOverrides(baseConfig, pluginOverrides);
    const plugin = factory(merged);

    if (disableSet.has(plugin.id)) continue;
    capabilities.push(plugin);
  }

  // Instantiate interfaces — merge overrides before construction
  const interfaces: Plugin[] = [];
  for (const [ctor, envMapper] of definition.interfaces) {
    const baseConfig = envMapper(env);
    const merged = mergeOverrides(baseConfig, pluginOverrides);
    const plugin = new ctor(merged);

    if (disableSet.has(plugin.id)) continue;
    interfaces.push(plugin);
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
    ...(definition.permissions && {
      permissions: {
        ...definition.permissions,
        ...(overrides?.anchors && { anchors: overrides.anchors }),
        ...(overrides?.trusted && { trusted: overrides.trusted }),
      },
    }),
    ...(!definition.permissions &&
      (overrides?.anchors || overrides?.trusted) && {
        permissions: {
          ...(overrides?.anchors && { anchors: overrides.anchors }),
          ...(overrides?.trusted && { trusted: overrides.trusted }),
        },
      }),
    deployment,

    // Log level: yaml overrides > env > undefined
    ...(overrides?.logLevel
      ? { logLevel: overrides.logLevel }
      : env["LOG_LEVEL"]
        ? {
            logLevel: env["LOG_LEVEL"] as "debug" | "info" | "warn" | "error",
          }
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

function mergeOverrides(
  baseConfig: PluginConfig,
  pluginOverrides: Record<string, Record<string, unknown>>,
): PluginConfig {
  if (Object.keys(pluginOverrides).length === 0) return baseConfig;
  let merged = { ...baseConfig };
  for (const ovr of Object.values(pluginOverrides)) {
    merged = { ...merged, ...ovr };
  }
  return merged;
}
