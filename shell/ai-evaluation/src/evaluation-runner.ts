import { resolve as resolvePath } from "path";

import { EvaluationService } from "./evaluation-service";
import type { EvaluationOptions, IReporter } from "./types";
import type { EvaluationSummary } from "./schemas";
import { ConsoleReporter } from "./reporters/console-reporter";
import { JSONReporter } from "./reporters/json-reporter";
import { MarkdownReporter } from "./reporters/markdown-reporter";
import { ComparisonReporter } from "./reporters/comparison-reporter";
import { EvalHandlerRegistry } from "./eval-handler-registry";
import type { RunEvaluationsOptions } from "./run-evaluation-types";

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
