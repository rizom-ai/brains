import type { Plugin } from "@brains/plugins";
import type { BrainDefinition, BrainEnvironment } from "./brain-definition";
import type { AppConfig } from "./types";
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
 * @param env - The deployment environment (credentials, domains, etc.)
 * @returns A fully resolved AppConfig ready for handleCLI() or App.create()
 *
 * @example
 * ```typescript
 * import definition from "@brains/my-brain";
 * import { resolve, handleCLI } from "@brains/app";
 *
 * const config = resolve(definition, process.env);
 * if (import.meta.main) handleCLI(config);
 * ```
 */
export function resolve(
  definition: BrainDefinition,
  env: BrainEnvironment,
): AppConfig {
  // Instantiate capabilities — fresh plugin instances every time
  // Config can be static or a function that receives the environment
  const capabilities: Plugin[] = definition.capabilities.map(
    ([factory, config]) => {
      const resolvedConfig =
        typeof config === "function" ? config(env) : config;
      return factory(resolvedConfig);
    },
  );

  // Instantiate interfaces — pass env through mapper
  const interfaces: Plugin[] = definition.interfaces.map(
    ([ctor, envMapper]) => {
      const config = envMapper(env);
      return new ctor(config);
    },
  );

  // Map identity to the format AppConfig expects
  const identity = definition.identity
    ? {
        name: definition.identity.characterName,
        role: definition.identity.role,
        purpose: definition.identity.purpose,
        values: definition.identity.values,
      }
    : undefined;

  // Build the app config
  const appConfig: AppConfig = {
    name: definition.name,
    version: definition.version,
    plugins: [...capabilities, ...interfaces],

    // AI keys from environment
    aiApiKey: env["ANTHROPIC_API_KEY"],
    openaiApiKey: env["OPENAI_API_KEY"],
    googleApiKey: env["GOOGLE_GENERATIVE_AI_API_KEY"],

    // Optional fields
    ...(identity && { identity }),
    ...(definition.permissions && { permissions: definition.permissions }),
    ...(definition.deployment && { deployment: definition.deployment }),
    ...(env["LOG_LEVEL"] && {
      logLevel: env["LOG_LEVEL"] as "debug" | "info" | "warn" | "error",
    }),
    ...(env["DATABASE_URL"] && { database: env["DATABASE_URL"] }),
  };

  // Merge any extra config (escape hatch)
  if (definition.extra) {
    Object.assign(appConfig, definition.extra);
  }

  return defineConfig(appConfig);
}
