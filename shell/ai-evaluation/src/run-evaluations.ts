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

import { resolve as resolvePath } from "path";
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
import type { RunEvaluationsOptions } from "./run-evaluation-types";
import { printHelp } from "./cli-help";
import { bootstrapCliEnvironment } from "./cli-bootstrap";

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
  await bootstrapCliEnvironment();
  main().catch(console.error);
}
