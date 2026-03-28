import { describe, it, expect } from "bun:test";
import { ComparisonReporter } from "../src/reporters/comparison-reporter";
import type { EvaluationSummary } from "../src/schemas";

function createSummary(
  overrides: Partial<EvaluationSummary> = {},
): EvaluationSummary {
  return {
    timestamp: "2026-03-28T14:30:00.000Z",
    totalTests: 10,
    passedTests: 8,
    failedTests: 2,
    passRate: 0.8,
    avgMetrics: {
      totalTokens: 1234,
      toolCallCount: 2.3,
      durationMs: 1200,
    },
    results: [],
    ...overrides,
  };
}

function makeResult(
  id: string,
  passed: boolean,
): EvaluationSummary["results"][number] {
  return {
    testCaseId: id,
    testCaseName: id,
    passed,
    timestamp: "2026-03-28T14:30:00.000Z",
    turnResults: [],
    totalMetrics: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      toolCallCount: 0,
      durationMs: 0,
      turnCount: 0,
    },
    failures: passed
      ? []
      : [{ criterion: "test", expected: "pass", actual: "fail" }],
  };
}

describe("ComparisonReporter", () => {
  it("should render metric deltas", () => {
    const reporter = ComparisonReporter.createFresh({
      outputDirectory: "/tmp/test-cmp",
    });

    const previous = createSummary({
      passRate: 0.936,
      avgMetrics: { totalTokens: 1456, toolCallCount: 3.0, durationMs: 1800 },
    });
    const current = createSummary({
      passRate: 0.957,
      avgMetrics: { totalTokens: 1234, toolCallCount: 2.3, durationMs: 1200 },
    });

    const md = reporter.renderComparison(current, previous);

    expect(md).toContain("## Comparison: current vs previous");
    expect(md).toContain("Pass rate");
    expect(md).toContain("+2.1%");
    expect(md).toContain("Avg tokens");
    expect(md).toContain("Avg duration");
  });

  it("should detect regressions", () => {
    const reporter = ComparisonReporter.createFresh({
      outputDirectory: "/tmp/test-cmp",
    });

    const previous = createSummary({
      results: [makeResult("search-tool", true), makeResult("list-tool", true)],
    });
    const current = createSummary({
      results: [
        makeResult("search-tool", false),
        makeResult("list-tool", true),
      ],
    });

    const md = reporter.renderComparison(current, previous);

    expect(md).toContain("### Regressions");
    expect(md).toContain("**search-tool**");
    expect(md).not.toContain("list-tool");
  });

  it("should detect fixes", () => {
    const reporter = ComparisonReporter.createFresh({
      outputDirectory: "/tmp/test-cmp",
    });

    const previous = createSummary({
      results: [
        makeResult("search-tool", false),
        makeResult("list-tool", false),
      ],
    });
    const current = createSummary({
      results: [
        makeResult("search-tool", false),
        makeResult("list-tool", true),
      ],
    });

    const md = reporter.renderComparison(current, previous);

    expect(md).toContain("### Fixes");
    expect(md).toContain("**list-tool**");
  });

  it("should show nothing when no regressions or fixes", () => {
    const reporter = ComparisonReporter.createFresh({
      outputDirectory: "/tmp/test-cmp",
    });

    const previous = createSummary({
      results: [makeResult("a", true), makeResult("b", false)],
    });
    const current = createSummary({
      results: [makeResult("a", true), makeResult("b", false)],
    });

    const md = reporter.renderComparison(current, previous);

    expect(md).not.toContain("### Regressions");
    expect(md).not.toContain("### Fixes");
  });
});
