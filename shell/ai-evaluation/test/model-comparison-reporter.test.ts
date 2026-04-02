import { describe, it, expect } from "bun:test";
import { renderModelComparison } from "../src/reporters/model-comparison-reporter";
import type { EvaluationSummary, EvaluationResult } from "../src/schemas";

function makeResult(testCaseId: string, passed: boolean): EvaluationResult {
  return {
    testCaseId,
    testCaseName: testCaseId,
    passed,
    timestamp: "2026-03-31T00:00:00Z",
    turnResults: [],
    totalMetrics: {
      promptTokens: 50,
      completionTokens: 50,
      totalTokens: 100,
      toolCallCount: 1,
      durationMs: 500,
      turnCount: 1,
    },
    failures: [],
  };
}

function makeSummary(opts: {
  passedTests: number;
  failedTests: number;
  totalTests: number;
  results?: EvaluationResult[];
}): EvaluationSummary {
  return {
    timestamp: "2026-03-31T00:00:00Z",
    totalTests: opts.totalTests,
    passedTests: opts.passedTests,
    failedTests: opts.failedTests,
    passRate: opts.totalTests > 0 ? opts.passedTests / opts.totalTests : 0,
    avgMetrics: { totalTokens: 450, toolCallCount: 2, durationMs: 1200 },
    results: opts.results ?? [],
  };
}

describe("renderModelComparison", () => {
  it("should produce markdown with summary table", () => {
    const md = renderModelComparison([
      {
        model: "gpt-4o-mini",
        summary: makeSummary({
          passedTests: 9,
          failedTests: 1,
          totalTests: 10,
        }),
      },
      {
        model: "claude-haiku-4-5",
        summary: makeSummary({
          passedTests: 8,
          failedTests: 2,
          totalTests: 10,
        }),
      },
    ]);

    expect(md).toContain("# Model Comparison");
    expect(md).toContain("gpt-4o-mini");
    expect(md).toContain("claude-haiku-4-5");
    expect(md).toContain("90%");
    expect(md).toContain("80%");
  });

  it("should include per-test matrix", () => {
    const md = renderModelComparison([
      {
        model: "gpt-4o-mini",
        summary: makeSummary({
          passedTests: 1,
          failedTests: 1,
          totalTests: 2,
          results: [makeResult("test-a", true), makeResult("test-b", false)],
        }),
      },
      {
        model: "claude-haiku-4-5",
        summary: makeSummary({
          passedTests: 2,
          failedTests: 0,
          totalTests: 2,
          results: [makeResult("test-a", true), makeResult("test-b", true)],
        }),
      },
    ]);

    expect(md).toContain("## Per-Test Results");
    expect(md).toContain("test-a");
    expect(md).toContain("test-b");
    expect(md).toContain("✅");
    expect(md).toContain("❌");
  });

  it("should handle single model", () => {
    const md = renderModelComparison([
      {
        model: "gpt-4o-mini",
        summary: makeSummary({ passedTests: 5, failedTests: 0, totalTests: 5 }),
      },
    ]);

    expect(md).toContain("gpt-4o-mini");
    expect(md).toContain("100%");
  });
});
