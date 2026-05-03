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
 *   bun run eval --url http://localhost:8080  # Run against remote instance
 *   bun run eval --url http://localhost:8080 --token <token>  # With auth
 */

import { resolve as resolvePath, join } from "path";
import type { IAgentService, IAIService } from "@brains/ai-service";

import { EvaluationService } from "./evaluation-service";
import type { EvaluationOptions, IReporter } from "./types";
import type { EvaluationSummary } from "./schemas";
import { ConsoleReporter } from "./reporters/console-reporter";
import { JSONReporter } from "./reporters/json-reporter";
import { MarkdownReporter } from "./reporters/markdown-reporter";
import { ComparisonReporter } from "./reporters/comparison-reporter";
import { EvalHandlerRegistry } from "./eval-handler-registry";
import { parseCliOptions } from "./cli-options";
import { loadEvalConfig } from "./eval-config-loader";
import { buildEvalDatabase } from "./eval-db-builder";
import { runMultiModelEvaluation } from "./multi-model-runner";
import { runSingleModelEvaluation } from "./single-model-runner";

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
  const summary = await runEvaluationsWithReporters(
    options,
    createDefaultReporters(options),
  );

  // Exit with error code if any tests failed
  if (summary.failedTests > 0) {
    process.exit(1);
  }
}

/**
 * Run evaluations and return the summary (for multi-model comparison).
 * Same as runEvaluations but returns the summary instead of process.exit.
 */
export async function runEvaluationsCollect(
  options: RunEvaluationsOptions,
): Promise<EvaluationSummary> {
  return runEvaluationsWithReporters(options, createCollectReporters(options));
}

async function runEvaluationsWithReporters(
  options: RunEvaluationsOptions,
  reporters: IReporter[],
): Promise<EvaluationSummary> {
  const testCasesDir =
    options.testCasesDir ?? resolvePath(process.cwd(), "test-cases");
  const resultsDir =
    options.resultsDir ?? resolvePath(process.cwd(), "eval-results");

  const evaluationService = EvaluationService.createFresh({
    agentService: options.agentService,
    aiService: options.aiService,
    testCasesDirectory: testCasesDir,
    reporters,
    evalHandlerRegistry: EvalHandlerRegistry.getInstance(),
  });

  logEvaluationStart(options, testCasesDir, resultsDir);
  return evaluationService.runEvaluations(buildEvaluationOptions(options));
}

function createDefaultReporters(options: RunEvaluationsOptions): IReporter[] {
  const resultsDir =
    options.resultsDir ?? resolvePath(process.cwd(), "eval-results");

  return [
    ...createBaseReporters(options),
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
  ];
}

function createCollectReporters(options: RunEvaluationsOptions): IReporter[] {
  return createBaseReporters(options);
}

function createBaseReporters(options: RunEvaluationsOptions): IReporter[] {
  const resultsDir =
    options.resultsDir ?? resolvePath(process.cwd(), "eval-results");
  const verbose = options.verbose ?? false;

  return [
    ConsoleReporter.createFresh({ verbose, showFailures: true }),
    JSONReporter.createFresh({ outputDirectory: resultsDir }),
  ];
}

function buildEvaluationOptions(
  options: RunEvaluationsOptions,
): EvaluationOptions {
  const evalOptions: EvaluationOptions = {
    skipLLMJudge: options.skipLLMJudge ?? false,
    ...(options.parallel && { parallel: options.parallel }),
    ...(options.maxParallel && { maxParallel: options.maxParallel }),
  };
  if (options.tags?.length) evalOptions.tags = options.tags;
  if (options.testCaseIds?.length)
    evalOptions.testCaseIds = options.testCaseIds;
  if (options.testType) evalOptions.testType = options.testType;
  return evalOptions;
}

function logEvaluationStart(
  options: RunEvaluationsOptions,
  testCasesDir: string | string[],
  resultsDir: string,
): void {
  console.log(`\nRunning evaluations...`);
  console.log(`Test cases: ${testCasesDir}`);
  console.log(`Results: ${resultsDir}`);
  if (options.parallel)
    console.log(`Parallel: up to ${options.maxParallel ?? 3} concurrent`);
  if (options.skipLLMJudge) console.log(`LLM Judge: skipped`);
  if (options.tags?.length) console.log(`Tags: ${options.tags.join(", ")}`);
  if (options.testCaseIds?.length)
    console.log(`Tests: ${options.testCaseIds.join(", ")}`);
  if (options.testType) console.log(`Type: ${options.testType}`);
  console.log("");
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
  --build-db          Build eval database from eval-content (no tests)
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
  bun run eval --url http://localhost:8080  Run against remote instance
`);
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

  const {
    skipLLMJudge,
    parallel,
    maxParallel,
    verbose,
    tags,
    testCaseIds,
    testType,
    remoteUrl,
    authToken,
    compareAgainst,
    saveBaseline,
  } = parseCliOptions(args);

  try {
    const evalConfigResult = await loadEvalConfig();
    const {
      config,
      testCasesDirs,
      brainModelPath,
      models,
      judge,
      resolveConfig: freshResolve,
    } = evalConfigResult;

    // Shared eval environment setup
    const evalHandlerRegistry = EvalHandlerRegistry.getInstance();
    const cloneData = process.argv.includes("--clone-data");

    // ── Build eval DB ─────────────────────────────────────────────────
    if (args.includes("--build-db")) {
      await buildEvalDatabase({
        config,
        evalHandlerRegistry,
        brainModelPath,
        cloneData,
      });
      process.exit(0);
    }

    // ── Multi-model evaluation ──────────────────────────────────────────
    if (models.length > 0) {
      await runMultiModelEvaluation({
        models,
        judge,
        config,
        testCasesDirs,
        brainModelPath,
        evalHandlerRegistry,
        cloneData,
        skipLLMJudge,
        verbose,
        parallel,
        maxParallel,
        tags,
        testCaseIds,
        testType,
        remoteUrl,
        authToken,
        resolveConfig: freshResolve,
        runEvaluationsCollect,
      });
    }

    // ── Single-model evaluation (default) ───────────────────────────────
    await runSingleModelEvaluation({
      config,
      testCasesDirs,
      brainModelPath,
      evalHandlerRegistry,
      cloneData,
      skipLLMJudge,
      verbose,
      parallel,
      maxParallel,
      tags,
      testCaseIds,
      testType,
      remoteUrl,
      authToken,
      compareAgainst,
      saveBaseline,
      runEvaluations,
    });

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

  const hasAnyKey =
    process.env["AI_API_KEY"] ??
    process.env["OPENAI_API_KEY"] ??
    process.env["ANTHROPIC_API_KEY"] ??
    process.env["GOOGLE_GENERATIVE_AI_API_KEY"];
  if (!hasAnyKey) {
    console.error(
      "No API key found. Set AI_API_KEY (or provider-specific keys) in shell/ai-evaluation/.env",
    );
    process.exit(1);
  }

  main().catch(console.error);
}
