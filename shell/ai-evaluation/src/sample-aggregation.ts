import type {
  EvaluationResult,
  EvaluationSummary,
  QualityScores,
} from "./schemas";

function mean(
  results: readonly EvaluationResult[],
  pick: (result: EvaluationResult) => number,
): number {
  return (
    results.reduce((sum, result) => sum + pick(result), 0) /
    Math.max(results.length, 1)
  );
}

/** The summary of a list of results: counts, pass rate, and mean metrics. */
export function summarizeResults(
  results: EvaluationResult[],
  timestamp: string = new Date().toISOString(),
): EvaluationSummary {
  const passedTests = results.filter((result) => result.passed).length;
  const scored = results.flatMap((result) =>
    result.qualityScores ? [result.qualityScores] : [],
  );
  const meanScore = (key: keyof Omit<QualityScores, "reasoning">): number =>
    scored.reduce((sum, scores) => sum + (scores[key] ?? 0), 0) / scored.length;
  const avgQualityScores: QualityScores | undefined =
    scored.length > 0
      ? {
          helpfulness: meanScore("helpfulness"),
          accuracy: meanScore("accuracy"),
          instructionFollowing: meanScore("instructionFollowing"),
          appropriateToolUse: meanScore("appropriateToolUse"),
        }
      : undefined;

  return {
    timestamp,
    totalTests: results.length,
    passedTests,
    failedTests: results.length - passedTests,
    passRate: results.length > 0 ? passedTests / results.length : 0,
    avgMetrics: {
      totalTokens: mean(results, (result) => result.totalMetrics.totalTokens),
      toolCallCount: mean(
        results,
        (result) => result.totalMetrics.toolCallCount,
      ),
      durationMs: mean(results, (result) => result.totalMetrics.durationMs),
    },
    avgQualityScores,
    results,
  };
}

/**
 * One summary of independently sampled runs of the same suite. Every sample's
 * results are kept, so counts and averages are per run, not per test.
 */
export function mergeSampleSummaries(
  samples: readonly EvaluationSummary[],
): EvaluationSummary {
  const [first, ...rest] = samples;
  if (!first) throw new Error("No evaluation samples to merge");
  if (rest.length === 0) return first;
  return summarizeResults(
    samples.flatMap((sample) => sample.results),
    first.timestamp,
  );
}

export interface TestPassRate {
  testCaseId: string;
  passes: number;
  runs: number;
}

/** How often each test passed across its runs, in first-seen order. */
export function perTestPassRates(summary: EvaluationSummary): TestPassRate[] {
  const rates = summary.results.reduce((byTest, result) => {
    const rate = byTest.get(result.testCaseId) ?? {
      testCaseId: result.testCaseId,
      passes: 0,
      runs: 0,
    };
    return byTest.set(result.testCaseId, {
      ...rate,
      passes: rate.passes + (result.passed ? 1 : 0),
      runs: rate.runs + 1,
    });
  }, new Map<string, TestPassRate>());
  return [...rates.values()];
}

/** Tests whose pass rate falls below the threshold; 1 means every run must pass. */
export function testsBelowPassRate(
  summary: EvaluationSummary,
  minPassRate: number,
): string[] {
  return perTestPassRates(summary)
    .filter((rate) => rate.passes / rate.runs < minPassRate)
    .map((rate) => rate.testCaseId);
}
