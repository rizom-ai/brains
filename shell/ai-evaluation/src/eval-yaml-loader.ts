import { z, fromYaml } from "@brains/utils";
import { defineConfig, type AppConfig } from "@brains/app";
import { pluginMetadataSchema, type Plugin } from "@brains/plugins";
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

function isPlugin(value: unknown): value is Plugin {
  if (typeof value !== "object" || value === null) return false;
  if (!pluginMetadataSchema.safeParse(value).success) return false;
  return typeof (value as Plugin).register === "function";
}

interface PluginFactoryCandidate {
  (config: Record<string, unknown>): unknown;
  new (config: Record<string, unknown>): unknown;
}

async function resolvePluginExport(
  moduleExports: Record<string, unknown>,
  pluginConfig: Record<string, unknown>,
  pluginPackageName: string,
): Promise<Plugin> {
  const entries = Object.entries(moduleExports);
  const candidates = entries.sort(([nameA, valueA], [nameB, valueB]) => {
    const rank = (name: string, value: unknown): number => {
      if (name === "default") return 0;
      if (isPlugin(value)) return 1;
      if (name.startsWith("create") && name.endsWith("Plugin")) return 2;
      if (name.endsWith("Plugin")) return 3;
      if (typeof value === "function") return 4;
      return 5;
    };

    return rank(nameA, valueA) - rank(nameB, valueB);
  });

  const errors: string[] = [];

  for (const [exportName, candidate] of candidates) {
    if (isPlugin(candidate)) {
      return candidate;
    }

    if (typeof candidate !== "function") {
      continue;
    }

    const factoryCandidate = candidate as PluginFactoryCandidate;

    try {
      const instance = await Promise.resolve(
        new factoryCandidate(pluginConfig),
      );
      if (isPlugin(instance)) {
        return instance;
      }
    } catch (error) {
      errors.push(
        `${exportName} via constructor failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      const instance = await Promise.resolve(factoryCandidate(pluginConfig));
      if (isPlugin(instance)) {
        return instance;
      }
    } catch (error) {
      errors.push(
        `${exportName} via factory failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  throw new Error(
    `Could not resolve a plugin export from ${pluginPackageName}. ` +
      `Tried exports: ${candidates.map(([name]) => name).join(", ")}.` +
      (errors.length > 0 ? ` Errors: ${errors.join(" | ")}` : ""),
  );
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
  const mod = (await import(evalConfig.plugin)) as Record<string, unknown>;
  const pluginConfig = evalConfig.config ?? {};
  const plugin = await resolvePluginExport(
    mod,
    pluginConfig,
    evalConfig.plugin,
  );

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
