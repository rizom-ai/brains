import { fromYaml } from "@brains/utils/yaml";
import { z } from "@brains/utils/zod";
import { dirname } from "node:path";
import { defineConfig, findPackageManifest, type AppConfig } from "@brains/app";
import {
  getPluginPackageMetadata,
  instantiatePluginPackageDefinition,
  isPluginPackageDefinition,
  pluginMetadataSchema,
  type InstalledPluginPackageMetadata,
  type Plugin,
} from "@brains/plugins";
import { readProviderKeys } from "@brains/ai-service";
import { getErrorMessage } from "@brains/utils/error";

/**
 * A plugin eval's eval.yaml.
 *
 * `plugin` is the module to import and `export` the one export of it that
 * provides the eval plugin, the module's default export when omitted. Nothing
 * else in the module is considered, so a package adding or renaming an export
 * never changes which plugin its evals run against.
 *
 * An export that is a plugin package definition is instantiated with
 * `config`, as a brain installs it. `pluginId` names the plugin id a
 * first-party entity package converted from a class is installed under, the
 * id the canonical brain keeps for it, so its evals address the handlers by
 * the names brains use. Tracked in docs/legacy-code-inventory.json.
 */
const evalYamlSchema: z.ZodObject<{
  plugin: z.ZodString;
  export: z.ZodOptional<z.ZodString>;
  pluginId: z.ZodOptional<z.ZodString>;
  ownedTypePluginId: z.ZodOptional<z.ZodString>;
  model: z.ZodOptional<z.ZodString>;
  config: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}> = z.object({
  plugin: z.string(),
  export: z.string().min(1).optional(),
  pluginId: z.string().min(1).optional(),
  /**
   * Where a first-party service's owned type installs when the service
   * keeps the id the type has, as the canonical brain installs it.
   */
  ownedTypePluginId: z.string().min(1).optional(),
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
 * The installed package a module belongs to: the metadata its definition was
 * registered with, otherwise the nearest package.json above the module, as a
 * brain finds an installed package's.
 */
function modulePackageMetadata(
  definition: Parameters<typeof getPluginPackageMetadata>[0],
  pluginModule: string,
): InstalledPluginPackageMetadata {
  const registered = getPluginPackageMetadata(definition);
  if (registered) return registered;
  const manifest = findPackageManifest(
    dirname(Bun.resolveSync(pluginModule, import.meta.dir)),
  );
  return { name: manifest.name, version: manifest.version };
}

/**
 * The plugins the named export provides: a plugin package definition
 * instantiated with eval.yaml's `config` (under `pluginId` when eval.yaml
 * names one), a plugin instance as it is, otherwise one built from `config`
 * by constructing the export (a plugin class) or, failing that, calling it
 * (a factory).
 */
async function resolvePluginExport(
  moduleExports: Record<string, unknown>,
  exportName: string,
  pluginConfig: Record<string, unknown>,
  pluginModule: string,
  pluginId: string | undefined,
  ownedTypePluginId?: string,
): Promise<Plugin[]> {
  if (!Object.hasOwn(moduleExports, exportName)) {
    throw new Error(
      `${pluginModule} has no export "${exportName}". ` +
        "Name the export that provides the eval plugin with `export:` in eval.yaml.",
    );
  }
  const candidate = moduleExports[exportName];
  if (isPluginPackageDefinition(candidate)) {
    return instantiatePluginPackageDefinition(
      candidate,
      pluginConfig,
      modulePackageMetadata(candidate, pluginModule),
      {
        ...(pluginId !== undefined && { pluginId }),
        ...(ownedTypePluginId !== undefined && { ownedTypePluginId }),
      },
    );
  }
  if (pluginId !== undefined) {
    throw new Error(
      `${pluginModule} export "${exportName}" is not a package definition; ` +
        "`pluginId` names the id a package definition is installed under.",
    );
  }
  if (isPlugin(candidate)) return [candidate];

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
  if (plugin) return [plugin];

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
  const plugins = await resolvePluginExport(
    mod,
    evalConfig.export ?? "default",
    pluginConfig,
    evalConfig.plugin,
    evalConfig.pluginId,
    evalConfig.ownedTypePluginId,
  );
  const [first] = plugins;
  if (!first) throw new Error(`${evalConfig.plugin} provides no plugin`);

  // The id eval.yaml names, else the first plugin's: a service keeping its
  // class's id installs its owned type first.
  const pluginId = evalConfig.pluginId ?? first.id;
  // A package's scoped id names its package, slash included; the throwaway
  // databases sit directly under /tmp.
  const evalDbBase = `/tmp/${pluginId.replace(/[^\w.-]/g, "-")}-eval-${Date.now()}`;
  const resolvedModel = evalConfig.model ?? process.env["AI_MODEL"];
  const providerKeys = readProviderKeys(process.env);

  return defineConfig({
    name: `${pluginId}-eval`,
    version: "0.1.0",
    ...(Object.keys(providerKeys).length > 0
      ? { aiProviderKeys: providerKeys }
      : {}),
    ...(resolvedModel ? { aiModel: resolvedModel } : {}),
    plugins,
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
