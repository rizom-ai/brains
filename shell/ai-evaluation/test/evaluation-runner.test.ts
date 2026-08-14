import { describe, expect, it } from "bun:test";
import {
  exitCodeForSummary,
  selectReporters,
  toEvaluationOptions,
} from "../src/evaluation-runner";
import type { EvaluationSummary } from "../src/schemas";
import type { IAgentService, IAIService } from "@brains/ai-service";

/**
 * Composition-layer tests. What the evaluation itself does is covered by
 * evaluation-service.test.ts; nothing here re-asserts aggregation, judging or
 * partial-failure behaviour. These cover the parts a CI eval run depends on
 * that no test reached before: which reporters an invocation produces, how CLI
 * flags become EvaluationOptions, and whether a failing run exits nonzero.
 */

// The runner never calls either of these — it only hands them to the service,
// which is faked or absent in every test here.
const agentService = {} as IAgentService;
const aiService = {} as IAIService;

function baseOptions(): { agentService: IAgentService; aiService: IAIService } {
  return { agentService, aiService };
}

function summary(
  overrides: Partial<EvaluationSummary> = {},
): EvaluationSummary {
  return {
    timestamp: "2026-08-14T00:00:00.000Z",
    totalTests: 2,
    passedTests: 2,
    failedTests: 0,
    passRate: 1,
    avgMetrics: { totalTokens: 0, toolCallCount: 0, durationMs: 0 },
    results: [],
    ...overrides,
  };
}

function reporterNames(reporters: readonly object[]): string[] {
  return reporters.map((reporter) => reporter.constructor.name);
}

describe("selectReporters", () => {
  it("writes console and JSON output on a plain run", () => {
    const names = reporterNames(
      selectReporters({ ...baseOptions(), resultsDir: "/tmp/results" }),
    );

    expect(names).toContain("ConsoleReporter");
    expect(names).toContain("JSONReporter");
  });

  it("adds the markdown report for a default run", () => {
    const names = reporterNames(
      selectReporters({ ...baseOptions(), resultsDir: "/tmp/results" }),
    );

    expect(names).toContain("MarkdownReporter");
  });

  it("omits the markdown report when collecting for model comparison", () => {
    const names = reporterNames(
      selectReporters(
        { ...baseOptions(), resultsDir: "/tmp/results" },
        { collectOnly: true },
      ),
    );

    expect(names).toEqual(["ConsoleReporter", "JSONReporter"]);
  });

  it("adds the comparison report only when a baseline is involved", () => {
    const plain = reporterNames(selectReporters(baseOptions()));
    expect(plain).not.toContain("ComparisonReporter");

    const comparing = reporterNames(
      selectReporters({ ...baseOptions(), compareAgainst: "main" }),
    );
    expect(comparing).toContain("ComparisonReporter");

    const saving = reporterNames(
      selectReporters({ ...baseOptions(), saveBaseline: "nightly" }),
    );
    expect(saving).toContain("ComparisonReporter");
  });

  it("never adds the comparison report to a collect run, baseline or not", () => {
    const names = reporterNames(
      selectReporters(
        { ...baseOptions(), compareAgainst: "main", saveBaseline: "nightly" },
        { collectOnly: true },
      ),
    );

    expect(names).toEqual(["ConsoleReporter", "JSONReporter"]);
  });
});

describe("toEvaluationOptions", () => {
  it("defaults to running the LLM judge", () => {
    expect(toEvaluationOptions(baseOptions()).skipLLMJudge).toBe(false);
  });

  it("carries the filters a CI invocation sets", () => {
    const options = toEvaluationOptions({
      ...baseOptions(),
      tags: ["smoke", "regression"],
      testCaseIds: ["case-1"],
      testType: "plugin",
      skipLLMJudge: true,
    });

    expect(options.tags).toEqual(["smoke", "regression"]);
    expect(options.testCaseIds).toEqual(["case-1"]);
    expect(options.testType).toBe("plugin");
    expect(options.skipLLMJudge).toBe(true);
  });

  it("omits empty filters rather than passing them through as empty lists", () => {
    // An empty tag list means "no filter", not "match nothing" — passing it on
    // would silently select zero test cases and report a vacuous pass.
    const options = toEvaluationOptions({
      ...baseOptions(),
      tags: [],
      testCaseIds: [],
    });

    expect(options.tags).toBeUndefined();
    expect(options.testCaseIds).toBeUndefined();
  });

  it("passes parallelism through only when asked for", () => {
    const serial = toEvaluationOptions(baseOptions());
    expect(serial.parallel).toBeUndefined();
    expect(serial.maxParallel).toBeUndefined();

    const parallel = toEvaluationOptions({
      ...baseOptions(),
      parallel: true,
      maxParallel: 5,
    });
    expect(parallel.parallel).toBe(true);
    expect(parallel.maxParallel).toBe(5);
  });
});

describe("exitCodeForSummary", () => {
  it("succeeds when every test passed", () => {
    expect(exitCodeForSummary(summary())).toBe(0);
  });

  it("fails when any test failed", () => {
    expect(
      exitCodeForSummary(
        summary({
          totalTests: 2,
          passedTests: 1,
          failedTests: 1,
          passRate: 0.5,
        }),
      ),
    ).toBe(1);
  });

  it("fails when a run produced no tests at all", () => {
    // A filter that matches nothing must not read as success: the historical
    // failure mode here is a CI job that silently verifies nothing.
    expect(
      exitCodeForSummary(
        summary({ totalTests: 0, passedTests: 0, failedTests: 0, passRate: 0 }),
      ),
    ).toBe(1);
  });
});
