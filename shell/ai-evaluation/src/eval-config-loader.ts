import { existsSync, readFileSync } from "fs";
import { resolve as resolvePath } from "path";
import {
  type AppConfig,
  resolve as resolveConfig,
  parseInstanceOverrides,
  InstanceOverridesParseError,
} from "@brains/app";

import { parseModelsField, parseJudgeField } from "./multi-model";

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
  /** Brain definition for re-resolution per model (multi-model only) */
  brainDefinition?: unknown;
  /** Resolve fresh config (re-reads env vars for interpolation) */
  resolveConfig?: () => AppConfig;
}

export async function loadEvalConfig(): Promise<EvalConfigResult> {
  const pluginConfig = await loadPluginEvalConfigIfPresent();
  if (pluginConfig) return pluginConfig;

  const brainConfig = await loadBrainEvalConfigIfPresent();
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

async function loadBrainEvalConfigIfPresent(): Promise<
  EvalConfigResult | undefined
> {
  const yamlPath = resolvePath(process.cwd(), "brain.eval.yaml");
  if (!existsSync(yamlPath)) return undefined;

  const content = readFileSync(yamlPath, "utf-8");
  const overrides = parseBrainEvalOverrides(content);
  const rawYaml = await parseRawBrainEvalYaml(content);
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
    const freshOverrides = parseInstanceOverrides(content);
    return resolveConfig(brainModule.default, process.env, freshOverrides);
  };

  return {
    config: freshResolve(),
    testCasesDirs,
    brainModelPath: brainModulePath,
    models,
    ...(judge ? { judge } : {}),
    resolveConfig: freshResolve,
  };
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
