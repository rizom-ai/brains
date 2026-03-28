import { describe, it, expect } from "bun:test";
import { MarkdownReporter } from "../src/reporters/markdown-reporter";
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

describe("MarkdownReporter", () => {
  it("should render header with test counts and pass rate", () => {
    const reporter = MarkdownReporter.createFresh({
      outputDirectory: "/tmp/test-md",
    });
    const md = reporter.render(createSummary());

    expect(md).toContain("## Eval Run (2026-03-28)");
    expect(md).toContain("**10 tests** — 8 passed, 2 failed (80.0%)");
  });

  it("should render metrics", () => {
    const reporter = MarkdownReporter.createFresh({
      outputDirectory: "/tmp/test-md",
    });
    const md = reporter.render(createSummary());

    expect(md).toContain("Tokens: 1234");
    expect(md).toContain("Tool calls: 2.3");
    expect(md).toContain("Duration: 1.2s");
  });

  it("should render failures", () => {
    const reporter = MarkdownReporter.createFresh({
      outputDirectory: "/tmp/test-md",
    });
    const md = reporter.render(
      createSummary({
        results: [
          {
            testCaseId: "tool-invocation-search",
            testCaseName: "Search Tool",
            passed: false,
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
            failures: [
              {
                criterion: "responseContains",
                expected: "results",
                actual: "no match",
                message: 'Response must contain "results"',
              },
            ],
          },
          {
            testCaseId: "tool-invocation-list",
            testCaseName: "List Tool",
            passed: true,
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
            failures: [],
          },
        ],
      }),
    );

    expect(md).toContain("### Failures");
    expect(md).toContain(
      '- **tool-invocation-search**: Response must contain "results"',
    );
    expect(md).not.toContain("tool-invocation-list");
  });

  it("should not render failures section when all pass", () => {
    const reporter = MarkdownReporter.createFresh({
      outputDirectory: "/tmp/test-md",
    });
    const md = reporter.render(
      createSummary({
        passedTests: 10,
        failedTests: 0,
        passRate: 1.0,
        results: [
          {
            testCaseId: "test-1",
            testCaseName: "Test 1",
            passed: true,
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
            failures: [],
          },
        ],
      }),
    );

    expect(md).not.toContain("### Failures");
  });

  it("should render quality scores when present", () => {
    const reporter = MarkdownReporter.createFresh({
      outputDirectory: "/tmp/test-md",
    });
    const md = reporter.render(
      createSummary({
        avgQualityScores: {
          helpfulness: 4.5,
          accuracy: 4.2,
          instructionFollowing: 4.8,
        },
      }),
    );

    expect(md).toContain("### Quality (avg)");
    expect(md).toContain("Helpfulness: 4.5");
    expect(md).toContain("Accuracy: 4.2");
    expect(md).toContain("Instructions: 4.8");
  });

  it("should render category breakdown from test case IDs", () => {
    const reporter = MarkdownReporter.createFresh({
      outputDirectory: "/tmp/test-md",
    });
    const md = reporter.render(
      createSummary({
        results: [
          {
            testCaseId: "tool-invocation-search",
            testCaseName: "Search",
            passed: true,
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
            failures: [],
          },
          {
            testCaseId: "tool-invocation-list",
            testCaseName: "List",
            passed: false,
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
            failures: [{ criterion: "x", expected: "y", actual: "z" }],
          },
          {
            testCaseId: "response-quality-helpful",
            testCaseName: "Helpful",
            passed: true,
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
            failures: [],
          },
        ],
      }),
    );

    expect(md).toContain("| tool-invocation | 1 | 1 | 50.0% |");
    expect(md).toContain("| response-quality | 1 | 0 | 100.0% |");
  });
});
