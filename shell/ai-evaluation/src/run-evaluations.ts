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

import { resolve as resolvePath } from "path";
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
import { ConsoleReporter } from "./reporters/console-reporter";
import { JSONReporter } from "./reporters/json-reporter";
import { RemoteAgentService } from "./remote-agent-service";
import { EvalHandlerRegistry } from "./eval-handler-registry";

export interface RunEvaluationsOptions {
  /** Agent service (from shell or remote) */
  agentService: IAgentService;
  /** AI service for LLM judge */
  aiService: IAIService;
  /** Directory containing test cases */
  testCasesDir?: string;
  /** Directory to save results */
  resultsDir?: string;
  /** Skip LLM-as-judge scoring */
  skipLLMJudge?: boolean;
  /** Filter by tags */
  tags?: string[];
  /** Specific test case IDs to run */
  testCaseIds?: string[];
  /** Filter by test type: "agent" or "plugin" */
  testType?: "agent" | "plugin";
  /** Show verbose output */
  verbose?: boolean;
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
    resultsDir = resolvePath(process.cwd(), "data/evaluation-results"),
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
    ],
    evalHandlerRegistry: EvalHandlerRegistry.getInstance(),
  });

  console.log(`\nRunning evaluations...`);
  console.log(`Test cases: ${testCasesDir}`);
  console.log(`Results: ${resultsDir}`);
  if (skipLLMJudge) console.log(`LLM Judge: skipped`);
  if (tags?.length) console.log(`Tags: ${tags.join(", ")}`);
  if (testCaseIds?.length) console.log(`Tests: ${testCaseIds.join(", ")}`);
  if (testType) console.log(`Type: ${testType}`);
  console.log("");

  const evalOptions: {
    skipLLMJudge: boolean;
    tags?: string[];
    testCaseIds?: string[];
    testType?: "agent" | "plugin";
  } = { skipLLMJudge };
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
  --skip-llm-judge    Skip LLM quality scoring (faster)
  --verbose, -v       Show verbose output
  --help, -h          Show this help message

Examples:
  bun run eval                              Run all tests
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
async function loadEvalConfig(): Promise<AppConfig> {
  // Try brain.eval.yaml first (new pattern)
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
    return resolveConfig(mod.default, process.env, overrides);
  }

  // Fall back to brain.eval.config.ts (legacy pattern)
  const configPath = resolvePath(process.cwd(), "brain.eval.config.ts");
  if (!existsSync(configPath)) {
    console.error(
      "❌ No brain.eval.yaml or brain.eval.config.ts found in current directory",
    );
    console.error(
      "Run this command from an app directory (e.g., apps/collective-brain)",
    );
    process.exit(1);
  }

  const configModule = await import(configPath);
  const config = configModule.default;
  if (!config) {
    console.error("❌ No default export found in brain.eval.config.ts");
    process.exit(1);
  }

  console.log("Loaded eval config from brain.eval.config.ts (legacy)");
  return config as AppConfig;
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

  try {
    const config = await loadEvalConfig();

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

    // Copy seed content into eval data dir so directory-sync picks it up
    const seedContentDir = resolvePath(process.cwd(), "seed-content");
    const evalDataDir = `${evalDbBase}-data`;
    if (existsSync(seedContentDir)) {
      mkdirSync(evalDataDir, { recursive: true });
      cpSync(seedContentDir, evalDataDir, { recursive: true });
      console.log("Copied seed-content into eval data dir");
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
      skipLLMJudge,
      verbose,
      ...(tags && { tags }),
      ...(testCaseIds && { testCaseIds }),
      ...(testType && { testType }),
    };

    await runEvaluations(runOptions);

    process.exit(0);
  } catch (error) {
    console.error("Failed to run evaluations:", error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.main) {
  main().catch(console.error);
}
