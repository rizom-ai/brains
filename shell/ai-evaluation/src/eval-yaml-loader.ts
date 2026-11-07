import { fromYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import { defineConfig, type AppConfig } from "@brains/app";
import { pluginMetadataSchema, type Plugin } from "@brains/plugins";
import { resolveProviderKey } from "./multi-model";
import { getErrorMessage } from "@brains/utils/error";

/**
 * A plugin eval's eval.yaml.
 *
 * `plugin` is the module to import and `export` the one export of it that
 * provides the eval plugin, the module's default export when omitted. Nothing
 * else in the module is considered, so a package adding or renaming an export
 * never changes which plugin its evals run against.
 */
const evalYamlSchema: z.ZodObject<{
  plugin: z.ZodString;
  export: z.ZodOptional<z.ZodString>;
  model: z.ZodOptional<z.ZodString>;
  config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}> = z.object({
  plugin: z.string(),
  export: z.string().min(1).optional(),
  model: z.string().optional(),
  config: z.record(z.string(), z.unknown()).optional(),
});
const moduleExportsSchema: z.ZodRecord<z.ZodString, z.ZodUnknown> = z.record(
  z.string(),
  z.unknown(),
);

export type EvalYamlConfig = z.output<typeof evalYamlSchema>;
export type EvalYamlConfigInput = z.input<typeof evalYamlSchema>;

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
  if (!("register" in value)) return false;
  return typeof value.register === "function";
}

/** A plugin `build` returns, or undefined with why it failed in `errors`. */
async function buildPlugin(
  via: string,
  build: () => unknown,
  errors: string[],
): Promise<Plugin | undefined> {
  try {
    const instance = await Promise.resolve(build());
    return isPlugin(instance) ? instance : undefined;
  } catch (error) {
    errors.push(`via ${via}: ${getErrorMessage(error)}`);
    return undefined;
  }
}

/**
 * The plugin the named export provides: a plugin instance as it is, otherwise
 * one built from eval.yaml's `config` by constructing the export (a plugin
 * class) or, failing that, calling it (a factory).
 */
async function resolvePluginExport(
  moduleExports: Record<string, unknown>,
  exportName: string,
  pluginConfig: Record<string, unknown>,
  pluginModule: string,
): Promise<Plugin> {
  if (!Object.hasOwn(moduleExports, exportName)) {
    throw new Error(
      `${pluginModule} has no export "${exportName}". ` +
        "Name the export that provides the eval plugin with `export:` in eval.yaml.",
    );
  }
  const candidate = moduleExports[exportName];
  if (isPlugin(candidate)) return candidate;

  const errors: string[] = [];
  const plugin =
    typeof candidate === "function"
      ? ((await buildPlugin(
          "constructor",
          () => Reflect.construct(candidate, [pluginConfig]),
          errors,
        )) ??
        (await buildPlugin(
          "factory",
          () => Reflect.apply(candidate, undefined, [pluginConfig]),
          errors,
        )))
      : undefined;
  if (plugin) return plugin;

  throw new Error(
    `${pluginModule} export "${exportName}" is not a plugin, a plugin class, or a plugin factory.` +
      (errors.length > 0 ? ` Errors: ${errors.join(" | ")}` : ""),
  );
}

/**
 * Load a plugin eval config from eval.yaml.
 *
 * Imports the plugin module, takes the plugin from the export eval.yaml
 * names (see `evalYamlSchema`), instantiates it with optional config, and
 * wraps it in a minimal AppConfig (throwaway databases under /tmp, no file
 * sync).
 */
export async function loadPluginEvalConfig(
  evalConfig: EvalYamlConfig,
): Promise<AppConfig> {
  const mod = moduleExportsSchema.parse(
    Object.fromEntries(Object.entries(await import(evalConfig.plugin))),
  );
  const pluginConfig = evalConfig.config ?? {};
  const plugin = await resolvePluginExport(
    mod,
    evalConfig.export ?? "default",
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
      embeddingDatabase: { url: `file:${evalDbBase}-embeddings.db` },
      runtimeStateDatabase: { url: `file:${evalDbBase}-runtime-state.db` },
      dataDir: `${evalDbBase}-data`,
    },
  });
}
