import { z, fromYaml } from "@brains/utils";
import { defineConfig, type AppConfig } from "@brains/app";
import type { Plugin } from "@brains/plugins";
import { resolveProviderKey } from "./multi-model";

const evalYamlSchema = z.object({
  plugin: z.string(),
  model: z.string().optional(),
  config: z.record(z.unknown()).optional(),
});

export type EvalYamlConfig = z.infer<typeof evalYamlSchema>;

/**
 * Parse an eval.yaml string. Returns the config if it has a `plugin` field,
 * null otherwise (so the caller can fall through to other config formats).
 */
export function parseEvalYaml(content: string): EvalYamlConfig | null {
  let raw: unknown;
  try {
    raw = fromYaml(content);
  } catch {
    return null;
  }

  const result = evalYamlSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Load a plugin eval config from eval.yaml.
 *
 * Imports the plugin package, instantiates it with optional config,
 * and wraps it in a minimal AppConfig (in-memory DB, no file sync).
 */
export async function loadPluginEvalConfig(
  evalConfig: EvalYamlConfig,
): Promise<AppConfig> {
  const mod = await import(evalConfig.plugin);

  // Find the plugin: look for a factory function or a class
  let plugin: Plugin;
  const pluginConfig = evalConfig.config ?? {};

  // Try common export patterns:
  // 1. Default export as factory: export default function blogPlugin(config) { ... }
  // 2. Named class: export class BlogPlugin extends EntityPlugin { ... }
  // 3. Named factory: export function blogPlugin(config) { ... }
  if (typeof mod.default === "function") {
    // Could be a class or factory
    try {
      plugin = new mod.default(pluginConfig);
    } catch {
      plugin = mod.default(pluginConfig);
    }
  } else {
    // TODO: This heuristic can pick the wrong export for plugin eval bootstrap.
    // Example: @brains/link exports LinkAdapter before LinkPlugin/createLinkPlugin,
    // so eval.yaml-based runs can instantiate a non-plugin class and fail AppConfig
    // validation before any evals execute. Replace this with explicit plugin export
    // resolution instead of "first function export wins".
    // Search for a factory function or class in named exports
    const exportNames = Object.keys(mod).filter((k) => k !== "default");
    const factoryOrClass = exportNames.find(
      (k) => typeof mod[k] === "function",
    );

    if (!factoryOrClass) {
      throw new Error(
        `No plugin factory or class found in ${evalConfig.plugin}. ` +
          `Expected a default export or named export that is a function/class.`,
      );
    }

    try {
      plugin = new mod[factoryOrClass](pluginConfig);
    } catch {
      plugin = mod[factoryOrClass](pluginConfig);
    }
  }

  const pluginId = plugin.id;
  const evalDbBase = `/tmp/${pluginId}-eval-${Date.now()}`;
  const resolvedModel = evalConfig.model ?? process.env["AI_MODEL"];
  const resolvedApiKey = resolvedModel
    ? resolveProviderKey(resolvedModel, process.env)
    : process.env["AI_API_KEY"];

  return defineConfig({
    name: `${pluginId}-eval`,
    version: "0.1.0",
    ...(resolvedApiKey ? { aiApiKey: resolvedApiKey } : {}),
    ...(resolvedModel ? { aiModel: resolvedModel } : {}),
    plugins: [plugin],
    shellConfig: {
      database: { url: `file:${evalDbBase}.db` },
      jobQueueDatabase: { url: `file:${evalDbBase}-jobs.db` },
      conversationDatabase: { url: `file:${evalDbBase}-conv.db` },
      dataDir: `${evalDbBase}-data`,
    },
  });
}
