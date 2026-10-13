import { describe, expect, it } from "bun:test";
import {
  mergeSampleSummaries,
  perTestPassRates,
  testsBelowPassRate,
} from "../src/sample-aggregation";
import type { EvaluationResult, EvaluationSummary } from "../src/schemas";

function result(
  testCaseId: string,
  passed: boolean,
  totalTokens = 100,
): EvaluationResult {
  return {
    testCaseId,
    testCaseName: testCaseId,
    passed,
    timestamp: "2026-10-08T00:00:00.000Z",
    turnResults: [],
    totalMetrics: {
      promptTokens: totalTokens,
      completionTokens: 0,
      totalTokens,
      toolCallCount: 1,
      durationMs: 1000,
      turnCount: 1,
    },
    failures: [],
  };
}

function sample(results: EvaluationResult[]): EvaluationSummary {
  const passedTests = results.filter((r) => r.passed).length;
  return {
    timestamp: "2026-10-08T00:00:00.000Z",
    totalTests: results.length,
    passedTests,
    failedTests: results.length - passedTests,
    passRate: results.length > 0 ? passedTests / results.length : 0,
    avgMetrics: { totalTokens: 100, toolCallCount: 1, durationMs: 1000 },
    results,
  };
}

describe("mergeSampleSummaries", () => {
  it("returns a single sample unchanged", () => {
    const only = sample([result("a", true), result("b", false)]);
    expect(mergeSampleSummaries([only])).toEqual(only);
  });

  it("keeps every sample's results and counts runs, not tests", () => {
    const merged = mergeSampleSummaries([
      sample([result("a", true, 100), result("b", false, 300)]),
      sample([result("a", false, 200), result("b", false, 500)]),
    ]);
    expect(merged.results).toHaveLength(4);
    expect(merged).toMatchObject({
      totalTests: 4,
      passedTests: 1,
      failedTests: 3,
      passRate: 0.25,
      avgMetrics: { totalTokens: 275, toolCallCount: 1, durationMs: 1000 },
    });
  });

  it("refuses to merge nothing", () => {
    expect(() => mergeSampleSummaries([])).toThrow();
  });
});

describe("perTestPassRates", () => {
  it("groups runs per test in first-seen order", () => {
    const merged = mergeSampleSummaries([
      sample([result("b", true), result("a", true)]),
      sample([result("b", false), result("a", true)]),
      sample([result("b", true), result("a", true)]),
    ]);
    expect(perTestPassRates(merged)).toEqual([
      { testCaseId: "b", passes: 2, runs: 3 },
      { testCaseId: "a", passes: 3, runs: 3 },
    ]);
  });
});

describe("testsBelowPassRate", () => {
  const merged = mergeSampleSummaries([
    sample([result("flaky", true), result("solid", true)]),
    sample([result("flaky", false), result("solid", true)]),
    sample([result("flaky", true), result("solid", true)]),
    sample([result("flaky", true), result("solid", true)]),
    sample([result("flaky", true), result("solid", true)]),
  ]);

  it("treats any failed run as failing by default", () => {
    expect(testsBelowPassRate(merged, 1)).toEqual(["flaky"]);
  });

  it("accepts a test at or above a lower threshold", () => {
    expect(testsBelowPassRate(merged, 0.8)).toEqual([]);
    expect(testsBelowPassRate(merged, 0.81)).toEqual(["flaky"]);
  });
});
