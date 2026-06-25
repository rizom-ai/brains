import { existsSync, readFileSync } from "fs";
import { resolve as resolvePath } from "path";
import {
  type AppConfig,
  resolve as resolveConfig,
  parseInstanceOverrides,
  InstanceOverridesParseError,
  type InstanceOverrides,
  type PresetName,
} from "@brains/app";

import { parseModelsField, parseJudgeField } from "./multi-model";

const PRESET_NAMES = new Set<string>(["core", "default", "full"]);

/**
 * Load eval config from brain.eval.yaml (preferred) or brain.eval.config.ts (legacy).
 *
 * brain.eval.yaml uses the brain model pattern:
 *   - Loads brain model package
 *   - Resolves with eval-specific overrides (disable dangerous plugins)
 *
 * brain.eval.config.ts uses the legacy defineConfig() pattern.
 */
export interface EvalConfigResult {
  config: AppConfig;
  testCasesDirs: string[];
  brainModelPath?: string;
  /** Models to evaluate against (from `models:` field in brain.eval.yaml) */
  models: string[];
  /** Judge model for LLM scoring (from `judge:` field) */
  judge?: string;
  /** Effective tags from the selected eval suite or CLI `--tags`. */
  tags?: string[];
  /** Brain definition for re-resolution per model (multi-model only) */
  brainDefinition?: unknown;
  /** Resolve fresh config (re-reads env vars for interpolation) */
  resolveConfig?: () => AppConfig;
}

export interface LoadEvalConfigOptions {
  /** CLI suite selector from brain.eval.yaml `suites:`. */
  suite?: string | undefined;
  /** CLI preset override; takes precedence over selected suite `preset:`. */
  preset?: PresetName | undefined;
  /** CLI tag override; takes precedence over selected suite `tags:`. */
  tags?: string[] | undefined;
}

export async function loadEvalConfig(
  options: LoadEvalConfigOptions = {},
): Promise<EvalConfigResult> {
  const pluginConfig = await loadPluginEvalConfigIfPresent();
  if (pluginConfig) return pluginConfig;

  const brainConfig = await loadBrainEvalConfigIfPresent(options);
  if (brainConfig) return brainConfig;

  return loadLegacyEvalConfig();
}

async function loadPluginEvalConfigIfPresent(): Promise<
  EvalConfigResult | undefined
> {
  const pluginEvalPath = resolvePath(process.cwd(), "eval.yaml");
  if (!existsSync(pluginEvalPath)) return undefined;

  const { parseEvalYaml, loadPluginEvalConfig } =
    await import("./eval-yaml-loader");
  const content = readFileSync(pluginEvalPath, "utf-8");
  const evalConfig = parseEvalYaml(content);
  if (!evalConfig) return undefined;

  console.log(
    `Loaded plugin eval config from eval.yaml (${evalConfig.plugin})`,
  );
  const config = await loadPluginEvalConfig(evalConfig);
  return {
    config,
    testCasesDirs: [resolvePath(process.cwd(), "test-cases")],
    models: [],
  };
}

async function loadBrainEvalConfigIfPresent(
  options: LoadEvalConfigOptions,
): Promise<EvalConfigResult | undefined> {
  const yamlPath = resolvePath(process.cwd(), "brain.eval.yaml");
  if (!existsSync(yamlPath)) return undefined;

  const content = readFileSync(yamlPath, "utf-8");
  const rawYaml = await parseRawBrainEvalYaml(content);
  const evalSelection = resolveEvalSelection(rawYaml, options);
  const overrides = applyCliOverrides(
    parseBrainEvalOverrides(content),
    evalSelection,
  );
  const models = parseModelsField(rawYaml);
  const judge = parseJudgeField(rawYaml);

  if (!overrides.brain) {
    console.error(
      '❌ brain.eval.yaml must contain a "brain" field, e.g.:\n  brain: rover',
    );
    process.exit(1);
  }

  const brainPackage = overrides.brain.startsWith("@")
    ? overrides.brain
    : `@brains/${overrides.brain}`;
  const brainModule = await import(brainPackage);
  if (!brainModule.default) {
    console.error(`❌ ${overrides.brain} does not have a default export`);
    process.exit(1);
  }

  console.log(`Loaded eval config from brain.eval.yaml (${brainPackage})`);

  const brainModulePath = import.meta
    .resolve(brainPackage)
    .replace("file://", "")
    .replace(/\/src\/.*$/, "");
  const testCasesDirs = resolveTestCaseDirectories(brainModulePath);

  // Re-resolve reads current process.env (picks up EVAL_GIT_REMOTE, AI_API_KEY).
  // The initial parse above already threw on any parse error, so at this
  // point we can assume the YAML is valid — if re-parsing fails later
  // (e.g. an env var disappeared), surface the error loud.
  const freshResolve = (): AppConfig => {
    const freshOverrides = applyCliOverrides(
      parseInstanceOverrides(content),
      evalSelection,
    );
    return resolveConfig(brainModule.default, process.env, freshOverrides);
  };

  return {
    config: freshResolve(),
    testCasesDirs,
    brainModelPath: brainModulePath,
    models,
    ...(judge ? { judge } : {}),
    ...(evalSelection.tags?.length ? { tags: evalSelection.tags } : {}),
    resolveConfig: freshResolve,
  };
}

export interface EvalSelection {
  preset?: PresetName;
  tags?: string[];
  plugins?: Record<string, Record<string, unknown>>;
}

export function resolveEvalSelection(
  rawYaml: Record<string, unknown>,
  options: LoadEvalConfigOptions,
): EvalSelection {
  const suiteSelection = options.suite
    ? resolveEvalSuite(rawYaml, options.suite)
    : undefined;
  const preset = options.preset ?? suiteSelection?.preset;
  const tags = options.tags ?? suiteSelection?.tags;

  return {
    ...(preset ? { preset } : {}),
    ...(tags?.length ? { tags } : {}),
    ...(suiteSelection?.plugins ? { plugins: suiteSelection.plugins } : {}),
  };
}

function resolveEvalSuite(
  rawYaml: Record<string, unknown>,
  suiteName: string,
): EvalSelection {
  const suites = rawYaml["suites"];
  if (!isRecord(suites)) {
    throw new Error(
      `Eval suite "${suiteName}" was requested, but brain.eval.yaml has no suites block.`,
    );
  }

  const visiting = new Set<string>();
  const resolved = new Map<string, EvalSelection>();

  const visit = (name: string): EvalSelection => {
    if (visiting.has(name)) {
      throw new Error(`Eval suite "${name}" extends itself in a cycle.`);
    }
    const cached = resolved.get(name);
    if (cached) return cached;

    const rawSuite = suites[name];
    if (!isRecord(rawSuite)) {
      throw new Error(`Unknown eval suite "${name}".`);
    }

    visiting.add(name);
    const parentNames = parseSuiteExtends(rawSuite["extends"], name);
    const parentSelections = parentNames.map((parentName) => visit(parentName));
    visiting.delete(name);

    const ownPreset = parseSuitePreset(rawSuite["preset"], name);
    const ownTags = parseSuiteTags(rawSuite["tags"], name);
    const ownPlugins = parseSuitePlugins(rawSuite["plugins"], name);
    const parentTags = parentSelections.flatMap(
      (selection) => selection.tags ?? [],
    );
    const inheritedPreset = [...parentSelections]
      .reverse()
      .find((selection) => selection.preset)?.preset;
    const preset = ownPreset ?? inheritedPreset;
    const parentPlugins = parentSelections.reduce<
      Record<string, Record<string, unknown>>
    >(
      (merged, selection) =>
        mergeRecords(merged, selection.plugins ?? {}) as Record<
          string,
          Record<string, unknown>
        >,
      {},
    );
    const plugins = mergeRecords(parentPlugins, ownPlugins) as Record<
      string,
      Record<string, unknown>
    >;

    const selection: EvalSelection = {
      ...(preset ? { preset } : {}),
      tags: uniqueStrings([...parentTags, ...ownTags]),
      ...(Object.keys(plugins).length ? { plugins } : {}),
    };
    resolved.set(name, selection);
    return selection;
  };

  return visit(suiteName);
}

function applyCliOverrides(
  overrides: InstanceOverrides,
  options: Pick<EvalSelection, "preset" | "plugins">,
): InstanceOverrides {
  if (!options.preset && !options.plugins) return overrides;
  return {
    ...overrides,
    ...(options.preset ? { preset: options.preset } : {}),
    ...(options.plugins
      ? {
          plugins: mergeRecords(
            overrides.plugins ?? {},
            options.plugins,
          ) as Record<string, Record<string, unknown>>,
        }
      : {}),
  };
}

function parseSuiteExtends(value: unknown, suiteName: string): string[] {
  if (value === undefined) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  throw new Error(
    `Eval suite "${suiteName}" has invalid extends; expected a string or string array.`,
  );
}

function parseSuitePreset(
  value: unknown,
  suiteName: string,
): PresetName | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "string" && PRESET_NAMES.has(value)) {
    return value as PresetName;
  }
  throw new Error(
    `Eval suite "${suiteName}" has invalid preset; expected core, default, or full.`,
  );
}

function parseSuiteTags(value: unknown, suiteName: string): string[] {
  if (value === undefined) return [];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
    return value;
  }
  throw new Error(
    `Eval suite "${suiteName}" has invalid tags; expected a string array.`,
  );
}

function parseSuitePlugins(
  value: unknown,
  suiteName: string,
): Record<string, Record<string, unknown>> {
  if (value === undefined) return {};
  if (!isRecord(value)) {
    throw new Error(
      `Eval suite "${suiteName}" has invalid plugins; expected a plugin config map.`,
    );
  }

  const plugins: Record<string, Record<string, unknown>> = {};
  for (const [pluginId, config] of Object.entries(value)) {
    if (!isRecord(config)) {
      throw new Error(
        `Eval suite "${suiteName}" has invalid plugins.${pluginId}; expected an object.`,
      );
    }
    plugins[pluginId] = config;
  }
  return plugins;
}

function mergeRecords(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = merged[key];
    merged[key] =
      isRecord(existing) && isRecord(value)
        ? mergeRecords(existing, value)
        : value;
  }
  return merged;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function parseBrainEvalOverrides(
  content: string,
): ReturnType<typeof parseInstanceOverrides> {
  try {
    return parseInstanceOverrides(content);
  } catch (err) {
    if (err instanceof InstanceOverridesParseError) {
      console.error(`❌ ${err.message}`);
    } else {
      console.error(
        `❌ unexpected error parsing brain.eval.yaml: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    process.exit(1);
  }
}

async function parseRawBrainEvalYaml(
  content: string,
): Promise<Record<string, unknown>> {
  try {
    const { fromYaml, interpolateEnv } = await import("@brains/utils");
    const parsed = fromYaml(content);
    if (parsed && typeof parsed === "object") {
      return interpolateEnv(parsed) as Record<string, unknown>;
    }
  } catch {
    // Ignore parse errors — overrides already parsed above.
  }

  return {};
}

function resolveTestCaseDirectories(brainModulePath: string): string[] {
  const shellTestCases = resolvePath(
    import.meta.dir,
    "..",
    "evals",
    "test-cases",
  );
  const brainModelTestCases = resolvePath(brainModulePath, "test-cases");
  const appTestCases = resolvePath(process.cwd(), "test-cases");

  return [shellTestCases, brainModelTestCases, appTestCases].filter((dir) =>
    existsSync(dir),
  );
}

async function loadLegacyEvalConfig(): Promise<EvalConfigResult> {
  const configPath = resolvePath(process.cwd(), "brain.eval.config.ts");
  if (!existsSync(configPath)) {
    console.error(
      "❌ No eval.yaml, brain.eval.yaml, or brain.eval.config.ts found in current directory",
    );
    console.error(
      "Run from an app directory (apps/*) or plugin eval directory (entities/*/evals/)",
    );
    process.exit(1);
  }

  const configModule = await import(configPath);
  const config: AppConfig | undefined = configModule.default;
  if (!config) {
    console.error("❌ No default export found in brain.eval.config.ts");
    process.exit(1);
  }

  console.log("Loaded eval config from brain.eval.config.ts (legacy)");
  return {
    config,
    testCasesDirs: [resolvePath(process.cwd(), "test-cases")],
    models: [],
  };
}
