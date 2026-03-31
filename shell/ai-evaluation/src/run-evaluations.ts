#!/usr/bin/env bun
/**
 * Standalone evaluation runner
 *
 * Usage from an app directory:
 *   bun run eval                              # Run all evaluations
 *   bun run eval --test tool-invocation-list  # Run specific test(s)
 *   bun run eval --filter my-test            # Alias for --test
 *   bun run eval --tags core                  # Run only tests with 'core' tag
 *   bun run eval --skip-llm-judge             # Skip LLM quality scoring
 *   bun run eval --verbose                    # Show verbose output
 *   bun run eval --url http://localhost:3333  # Run against remote instance
 *   bun run eval --url http://localhost:3333 --token <token>  # With auth
 */

import { resolve as resolvePath, join } from "path";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  rmSync,
  copyFileSync,
  cpSync,
} from "fs";
import { execSync } from "child_process";
import type { IAgentService } from "@brains/ai-service";
import type { IAIService } from "@brains/ai-service";
import {
  type AppConfig,
  resolve as resolveConfig,
  parseInstanceOverrides,
  App,
} from "@brains/app";
import { EvaluationService } from "./evaluation-service";
import type { EvaluationOptions } from "./types";
import { ConsoleReporter } from "./reporters/console-reporter";
import { JSONReporter } from "./reporters/json-reporter";
import { MarkdownReporter } from "./reporters/markdown-reporter";
import { ComparisonReporter } from "./reporters/comparison-reporter";
import { RemoteAgentService } from "./remote-agent-service";
import { EvalHandlerRegistry } from "./eval-handler-registry";

export interface RunEvaluationsOptions {
  /** Agent service (from shell or remote) */
  agentService: IAgentService;
  /** AI service for LLM judge */
  aiService: IAIService;
  /** Directory containing test cases */
  testCasesDir?: string | string[];
  /** Directory to save results */
  resultsDir?: string;
  /** Skip LLM-as-judge scoring */
  skipLLMJudge?: boolean;
  /** Compare against previous run or named baseline */
  compareAgainst?: string;
  /** Save results as a named baseline */
  saveBaseline?: string;
  /** Filter by tags */
  tags?: string[];
  /** Specific test case IDs to run */
  testCaseIds?: string[];
  /** Filter by test type: "agent" or "plugin" */
  testType?: "agent" | "plugin";
  /** Show verbose output */
  verbose?: boolean;
  /** Run tests in parallel */
  parallel?: boolean;
  /** Maximum parallel tests (default: 3) */
  maxParallel?: number;
}

/**
 * Run evaluations against an agent service
 */
export async function runEvaluations(
  options: RunEvaluationsOptions,
): Promise<void> {
  const {
    agentService,
    aiService,
    testCasesDir = resolvePath(process.cwd(), "test-cases"),
    resultsDir = resolvePath(process.cwd(), "eval-results"),
    skipLLMJudge = false,
    tags,
    testCaseIds,
    testType,
    verbose = false,
  } = options;

  const evaluationService = EvaluationService.createFresh({
    agentService,
    aiService,
    testCasesDirectory: testCasesDir,
    reporters: [
      ConsoleReporter.createFresh({ verbose, showFailures: true }),
      JSONReporter.createFresh({ outputDirectory: resultsDir }),
      MarkdownReporter.createFresh({ outputDirectory: resultsDir }),
      ...(options.compareAgainst !== undefined || options.saveBaseline
        ? [
            ComparisonReporter.createFresh({
              outputDirectory: resultsDir,
              ...(options.compareAgainst !== undefined && {
                compareAgainst: options.compareAgainst,
              }),
              ...(options.saveBaseline && {
                saveBaseline: options.saveBaseline,
              }),
            }),
          ]
        : []),
    ],
    evalHandlerRegistry: EvalHandlerRegistry.getInstance(),
  });

  console.log(`\nRunning evaluations...`);
  console.log(`Test cases: ${testCasesDir}`);
  console.log(`Results: ${resultsDir}`);
  if (options.parallel)
    console.log(`Parallel: up to ${options.maxParallel ?? 3} concurrent`);
  if (skipLLMJudge) console.log(`LLM Judge: skipped`);
  if (tags?.length) console.log(`Tags: ${tags.join(", ")}`);
  if (testCaseIds?.length) console.log(`Tests: ${testCaseIds.join(", ")}`);
  if (testType) console.log(`Type: ${testType}`);
  console.log("");

  const evalOptions: EvaluationOptions = {
    skipLLMJudge,
    ...(options.parallel && { parallel: options.parallel }),
    ...(options.maxParallel && { maxParallel: options.maxParallel }),
  };
  if (tags?.length) evalOptions.tags = tags;
  if (testCaseIds?.length) evalOptions.testCaseIds = testCaseIds;
  if (testType) evalOptions.testType = testType;
  const summary = await evaluationService.runEvaluations(evalOptions);

  // Exit with error code if any tests failed
  if (summary.failedTests > 0) {
    process.exit(1);
  }
}

/**
 * Parse a comma-separated flag value from args
 */
function parseFlag(args: string[], flag: string): string[] | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value.split(",");
}

/**
 * Parse a single string flag value from args
 */
function parseSingleFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) return undefined;
  return value;
}

/**
 * Print help message
 */
function printHelp(): void {
  console.log(`
AI Evaluation Runner

Usage: bun run eval [options]

Options:
  --test <ids>        Run specific test(s), comma-separated
  --filter <ids>      Alias for --test
  --tags <tags>       Filter tests by tag(s), comma-separated
  --type <type>       Filter by type: "agent" or "plugin"
  --url <url>         Run against a remote brain instance
  --token <token>     Auth token for remote instance
  --compare [name]    Compare with previous run or named baseline
  --baseline <name>   Save results as a named baseline
  --skip-llm-judge    Skip LLM quality scoring (faster)
  --parallel, -p      Run tests in parallel (default: 3 concurrent)
  --max-parallel <n>  Set max concurrent tests (default: 3)
  --verbose, -v       Show verbose output
  --help, -h          Show this help message

Examples:
  bun run eval                              Run all tests
  bun run eval --compare                    Compare with last run
  bun run eval --compare baseline           Compare with named baseline
  bun run eval --baseline pre-refactor      Save as named baseline
  bun run eval --parallel                   Run tests in parallel (3x faster)
  bun run eval --parallel --max-parallel 5  Run up to 5 tests at once
  bun run eval --test tool-invocation-list  Run single test
  bun run eval --filter my-test             Run single test (alias)
  bun run eval --test list,search           Run multiple tests
  bun run eval --tags core                  Run tests tagged 'core'
  bun run eval --type plugin                Run only plugin tests
  bun run eval --type agent                 Run only agent tests
  bun run eval --skip-llm-judge             Skip LLM judge for speed
  bun run eval --url http://localhost:3333  Run against remote instance
`);
}

/**
 * Load eval config from brain.eval.yaml (preferred) or brain.eval.config.ts (legacy).
 *
 * brain.eval.yaml uses the brain model pattern:
 *   - Loads brain model package
 *   - Resolves with eval-specific overrides (disable dangerous plugins)
 *
 * brain.eval.config.ts uses the legacy defineConfig() pattern.
 */
interface EvalConfigResult {
  config: AppConfig;
  testCasesDirs: string[];
  brainModelPath?: string;
}

async function loadEvalConfig(): Promise<EvalConfigResult> {
  // Try eval.yaml first (plugin eval — minimal brain, single plugin)
  const pluginEvalPath = resolvePath(process.cwd(), "eval.yaml");
  if (existsSync(pluginEvalPath)) {
    const { parseEvalYaml, loadPluginEvalConfig } =
      await import("./eval-yaml-loader");
    const content = readFileSync(pluginEvalPath, "utf-8");
    const evalConfig = parseEvalYaml(content);
    if (evalConfig) {
      console.log(
        `Loaded plugin eval config from eval.yaml (${evalConfig.plugin})`,
      );
      const config = await loadPluginEvalConfig(evalConfig);
      return {
        config,
        testCasesDirs: [resolvePath(process.cwd(), "test-cases")],
      };
    }
  }

  // Try brain.eval.yaml (agent eval — full brain with eval mode)
  const yamlPath = resolvePath(process.cwd(), "brain.eval.yaml");
  if (existsSync(yamlPath)) {
    const content = readFileSync(yamlPath, "utf-8");
    const overrides = parseInstanceOverrides(content);

    if (!overrides.brain) {
      console.error(
        '❌ brain.eval.yaml must contain a "brain" field, e.g.:\n  brain: "@brains/ranger"',
      );
      process.exit(1);
    }

    const mod = await import(overrides.brain);
    if (!mod.default) {
      console.error(`❌ ${overrides.brain} does not have a default export`);
      process.exit(1);
    }

    console.log(`Loaded eval config from brain.eval.yaml (${overrides.brain})`);

    // Resolve test case directories: shell → brain model → app instance
    const shellTestCases = resolvePath(
      import.meta.dir,
      "..",
      "evals",
      "test-cases",
    );
    // Resolve brain package path to find its test-cases directory
    // import.meta.resolve returns a file:// URL, convert to path
    const brainModulePath = import.meta
      .resolve(overrides.brain)
      .replace("file://", "")
      .replace(/\/src\/.*$/, "");
    const brainModelTestCases = resolvePath(brainModulePath, "test-cases");
    const appTestCases = resolvePath(process.cwd(), "test-cases");

    // Only include directories that exist
    const testCasesDirs = [
      shellTestCases,
      brainModelTestCases,
      appTestCases,
    ].filter((dir) => existsSync(dir));

    return {
      config: resolveConfig(mod.default, process.env, overrides),
      testCasesDirs,
      brainModelPath: brainModulePath,
    };
  }

  // Fall back to brain.eval.config.ts (legacy pattern)
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
  };
}

/**
 * CLI entry point - parses args and runs evaluations
 * Expects to be called from an app directory with access to brain.eval.yaml or brain.eval.config.ts
 */
export async function main(): Promise<void> {
  const args = process.argv.slice(2);

  // Show help
  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  // Parse CLI args
  const skipLLMJudge = args.includes("--skip-llm-judge");
  const parallel = args.includes("--parallel") || args.includes("-p");
  const maxParallelArg = parseSingleFlag(args, "--max-parallel");
  const maxParallel = maxParallelArg ? parseInt(maxParallelArg, 10) : 3;
  const verbose = args.includes("--verbose") || args.includes("-v");
  const tags = parseFlag(args, "--tags");
  const testCaseIds = parseFlag(args, "--test") ?? parseFlag(args, "--filter");
  const testTypeArg = parseSingleFlag(args, "--type");
  const testType =
    testTypeArg === "agent" || testTypeArg === "plugin"
      ? testTypeArg
      : undefined;
  const remoteUrl = parseSingleFlag(args, "--url");
  const authToken = parseSingleFlag(args, "--token");
  const compareFlag = args.includes("--compare");
  const compareAgainst = compareFlag
    ? (parseSingleFlag(args, "--compare") ?? "")
    : undefined;
  const saveBaseline = parseSingleFlag(args, "--baseline");

  try {
    const { config, testCasesDirs, brainModelPath } = await loadEvalConfig();

    // Create and initialize the app (needed for AI service in both modes)
    // Use a temp database and data directory for evals to avoid polluting real data
    // Temp files are cleaned up on system reboot
    const evalDbBase = `/tmp/brain-eval-${Date.now()}`;

    // Get the eval handler registry - plugins will register their handlers here
    const evalHandlerRegistry = EvalHandlerRegistry.getInstance();

    // Check if we should clone existing data (--clone-data flag)
    const cloneData = process.argv.includes("--clone-data");

    if (cloneData) {
      // Copy existing brain.db and brain-data to temp location
      // This allows evals to use existing indexed content without re-syncing
      // Note: jobs and conversations are NOT cloned (fresh for each eval run)
      const sourceDataDir = resolvePath(process.cwd(), "data");
      const sourceBrainData = resolvePath(process.cwd(), "brain-data");

      // Copy main entity database if it exists
      if (existsSync(`${sourceDataDir}/brain.db`)) {
        copyFileSync(`${sourceDataDir}/brain.db`, `${evalDbBase}.db`);
        console.log("Cloned brain.db for eval");
      }

      // Copy brain-data directory (markdown files) if it exists
      if (existsSync(sourceBrainData)) {
        mkdirSync(`${evalDbBase}-data`, { recursive: true });
        cpSync(sourceBrainData, `${evalDbBase}-data`, { recursive: true });
        console.log("Cloned brain-data for eval");
      }
    }

    // Copy eval content into eval data dir
    // Resolution order: cwd/eval-content → brain model/eval-content → cwd/seed-content
    const evalDataDir = `${evalDbBase}-data`;
    const candidateDirs = [
      resolvePath(process.cwd(), "eval-content"),
      ...(brainModelPath ? [resolvePath(brainModelPath, "eval-content")] : []),
      resolvePath(process.cwd(), "seed-content"),
    ];
    const contentDir = candidateDirs.find((d) => existsSync(d));
    if (contentDir) {
      mkdirSync(evalDataDir, { recursive: true });
      cpSync(contentDir, evalDataDir, { recursive: true });
      console.log(`Copied ${contentDir} into eval data dir`);
    }

    // Recreate bare git repo fresh each run to avoid stale data from previous evals
    const gitRemotePath = "/tmp/brain-eval-git-remote";
    if (existsSync(gitRemotePath)) {
      rmSync(gitRemotePath, { recursive: true, force: true });
    }
    mkdirSync(gitRemotePath, { recursive: true });
    execSync("git init --bare", { cwd: gitRemotePath, stdio: "ignore" });

    const evalConfig = {
      ...config,
      database: undefined, // Clear to prevent overriding shellConfig.database
      shellConfig: {
        ...config.shellConfig,
        database: { url: `file:${evalDbBase}.db` },
        jobQueueDatabase: { url: `file:${evalDbBase}-jobs.db` },
        conversationDatabase: { url: `file:${evalDbBase}-conv.db` },
        embedding: { cacheDir: `${evalDbBase}-cache` },
        // Inject eval handler registry so plugins can register handlers via context
        evalHandlerRegistry,
        // Override data directory so file-based plugins use temp directory
        dataDir: `${evalDbBase}-data`,
      },
    };
    const app = App.create(evalConfig);
    await app.initialize();

    const shell = app.getShell();
    const aiService = shell.getAIService();

    // Determine which agent service to use
    const agentService = remoteUrl
      ? RemoteAgentService.createFresh({ baseUrl: remoteUrl, authToken })
      : shell.getAgentService();

    if (remoteUrl) {
      console.log(`\nConnecting to remote brain: ${remoteUrl}`);
    }

    const runOptions: RunEvaluationsOptions = {
      agentService,
      aiService,
      testCasesDir: testCasesDirs,
      skipLLMJudge,
      verbose,
      parallel,
      maxParallel,
      ...(tags && { tags }),
      ...(testCaseIds && { testCaseIds }),
      ...(testType && { testType }),
      ...(compareAgainst !== undefined && { compareAgainst }),
      ...(saveBaseline && { saveBaseline }),
    };

    await runEvaluations(runOptions);

    process.exit(0);
  } catch (error) {
    console.error("Failed to run evaluations:", error);
    process.exit(1);
  }
}

if (import.meta.main) {
  // Load .env from the ai-evaluation package directory.
  // This is the single location for eval secrets (API keys).
  const { config } = await import("dotenv");
  config({ path: join(import.meta.dir, "..", ".env") });

  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.error(
      "ANTHROPIC_API_KEY not set. Add it to shell/ai-evaluation/.env or export it in your shell.",
    );
    process.exit(1);
  }

  main().catch(console.error);
}
