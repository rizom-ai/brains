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
    selectReporters(options),
  );

  const code = exitCodeForSummary(summary);
  if (code !== 0) {
    process.exit(code);
  }
}

/**
 * The exit code a finished run should produce.
 *
 * Separated from `runEvaluations` so the decision is testable without a
 * `process.exit` that would take the test runner down with it.
 *
 * A run that executed no tests fails. CI invokes this with tag and id filters,
 * and a filter that matches nothing would otherwise report success while having
 * verified nothing at all — the same silent-green failure mode Phase 0 removed
 * from the test scripts.
 */
export function exitCodeForSummary(summary: EvaluationSummary): number {
  if (summary.totalTests === 0) return 1;
  return summary.failedTests > 0 ? 1 : 0;
}

/**
 * Run evaluations and return the summary (for multi-model comparison).
 * Same as runEvaluations but returns the summary instead of process.exit.
 */
export async function runEvaluationsCollect(
  options: RunEvaluationsOptions,
): Promise<EvaluationSummary> {
  return runEvaluationsWithReporters(
    options,
    selectReporters(options, { collectOnly: true }),
  );
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
    ...(options.indexReadiness
      ? { indexReadiness: options.indexReadiness }
      : {}),
    ...(options.runtimeUploads
      ? { runtimeUploads: options.runtimeUploads }
      : {}),
  });

  logEvaluationStart(options, testCasesDir, resultsDir);
  return evaluationService.runEvaluations(toEvaluationOptions(options));
}

/** Only the fields reporter selection reads. */
export type ReporterSelectionInput = Pick<
  RunEvaluationsOptions,
  "resultsDir" | "verbose" | "compareAgainst" | "saveBaseline"
>;

/** Only the fields the evaluation filters are built from. */
export type EvaluationFilterInput = Pick<
  RunEvaluationsOptions,
  | "skipLLMJudge"
  | "parallel"
  | "maxParallel"
  | "tags"
  | "testCaseIds"
  | "testType"
>;

export interface SelectReportersOptions {
  /**
   * Collect the summary for a caller that will report on it later, rather than
   * writing a report of this run. Multi-model comparison uses this: each model's
   * run would otherwise overwrite the previous one's markdown and baseline.
   */
  collectOnly?: boolean;
}

/**
 * Which reporters an invocation produces.
 *
 * Exported because it is the part of a CLI run most easily got wrong and least
 * visible when it is: a missing reporter loses output nobody notices, and a
 * comparison reporter added to a collect run overwrites a baseline.
 */
export function selectReporters(
  options: ReporterSelectionInput,
  { collectOnly = false }: SelectReportersOptions = {},
): IReporter[] {
  if (collectOnly) return createBaseReporters(options);

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

function createBaseReporters(options: ReporterSelectionInput): IReporter[] {
  const resultsDir =
    options.resultsDir ?? resolvePath(process.cwd(), "eval-results");
  const verbose = options.verbose ?? false;

  return [
    ConsoleReporter.createFresh({ verbose, showFailures: true }),
    JSONReporter.createFresh({ outputDirectory: resultsDir }),
  ];
}

/**
 * Map CLI flags onto the options the evaluation service takes.
 *
 * Exported for the same reason as selectReporters: an empty tags or ids list
 * means "no filter", and forwarding it as an empty list would select no test
 * cases and report a vacuous pass.
 */
export function toEvaluationOptions(
  options: EvaluationFilterInput,
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
