import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { ConsoleReporter } from "../src/reporters/console-reporter";
import type { EvaluationResult, EvaluationSummary } from "../src/schemas";

/**
 * Output shape, not formatting. These assert which facts reach the operator —
 * that a failure is named, that verbose adds detail and non-verbose withholds
 * it — rather than pinning whitespace, rule characters or colour codes, which
 * would make every cosmetic edit a test failure.
 */

/** chalk emits ANSI escapes; strip them so assertions read the text. */
function plain(lines: readonly string[]): string {
  // eslint-disable-next-line no-control-regex -- the ANSI escape it strips is a control character by definition
  return lines.join("\n").replace(/\[[0-9;]*m/g, "");
}

function captureReport(
  reporter: ConsoleReporter,
  summary: EvaluationSummary,
): Promise<string> {
  const lines: string[] = [];
  const log = spyOn(console, "log").mockImplementation((...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  });
  return reporter
    .report(summary)
    .then(() => plain(lines))
    .finally(() => {
      log.mockRestore();
    });
}

afterEach(() => {
  // Belt and braces: a reporter that threw mid-report would otherwise leave
  // console.log stubbed for every later test in the file.
  spyOn(console, "log").mockRestore();
});

function createResult(
  overrides: Partial<EvaluationResult> = {},
): EvaluationResult {
  return {
    testCaseId: "tool-invocation-search",
    testCaseName: "Search Tool",
    passed: true,
    timestamp: "2026-03-28T14:30:00.000Z",
    turnResults: [],
    totalMetrics: {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 4321,
      toolCallCount: 3,
      durationMs: 900,
      turnCount: 1,
    },
    failures: [],
    ...overrides,
  };
}

const failingResult = createResult({
  testCaseId: "tool-invocation-list",
  testCaseName: "List Tool",
  passed: false,
  failures: [
    {
      criterion: "responseContains",
      expected: "results",
      actual: "no match",
      message: 'Response must contain "results"',
    },
  ],
});

function createSummary(
  overrides: Partial<EvaluationSummary> = {},
): EvaluationSummary {
  return {
    timestamp: "2026-03-28T14:30:00.000Z",
    totalTests: 2,
    passedTests: 1,
    failedTests: 1,
    passRate: 0.5,
    avgMetrics: { totalTokens: 1234, toolCallCount: 2.3, durationMs: 1200 },
    results: [createResult(), failingResult],
    ...overrides,
  };
}

describe("ConsoleReporter", () => {
  it("marks each test as passed or failed by name", async () => {
    const output = await captureReport(
      ConsoleReporter.createFresh(),
      createSummary(),
    );

    expect(output).toContain("PASS Search Tool (tool-invocation-search)");
    expect(output).toContain("FAIL List Tool (tool-invocation-list)");
  });

  it("reports the counts and pass rate", async () => {
    const output = await captureReport(
      ConsoleReporter.createFresh(),
      createSummary(),
    );

    expect(output).toContain("1 passed");
    expect(output).toContain("1 failed");
    expect(output).toContain("2 total");
    expect(output).toContain("50.0%");
  });

  it("names the failed criterion so a failure is actionable", async () => {
    const output = await captureReport(
      ConsoleReporter.createFresh(),
      createSummary(),
    );

    expect(output).toContain('Response must contain "results"');
  });

  it("withholds expected-versus-actual unless verbose", async () => {
    const quiet = await captureReport(
      ConsoleReporter.createFresh({ verbose: false }),
      createSummary(),
    );
    expect(quiet).not.toContain("Expected:");
    expect(quiet).not.toContain("Actual:");

    const verbose = await captureReport(
      ConsoleReporter.createFresh({ verbose: true }),
      createSummary(),
    );
    expect(verbose).toContain('Expected: "results"');
    expect(verbose).toContain('Actual: "no match"');
  });

  it("suppresses failure detail entirely when showFailures is off", async () => {
    const output = await captureReport(
      ConsoleReporter.createFresh({ showFailures: false }),
      createSummary(),
    );

    // The test is still listed as failed; only the per-criterion detail goes.
    expect(output).toContain("FAIL List Tool");
    expect(output).not.toContain('Response must contain "results"');
  });

  it("adds per-test metrics only when verbose", async () => {
    const quiet = await captureReport(
      ConsoleReporter.createFresh({ verbose: false }),
      createSummary(),
    );
    expect(quiet).not.toContain("Tokens: 4321");

    const verbose = await captureReport(
      ConsoleReporter.createFresh({ verbose: true }),
      createSummary(),
    );
    expect(verbose).toContain("Tokens: 4321");
    expect(verbose).toContain("Tool Calls: 3");
  });

  it("reports quality scores when the judge produced them", async () => {
    const withScores = await captureReport(
      ConsoleReporter.createFresh(),
      createSummary({
        avgQualityScores: {
          helpfulness: 4.5,
          accuracy: 3.2,
          instructionFollowing: 4.9,
        },
      }),
    );

    expect(withScores).toContain("Average Quality Scores");
    expect(withScores).toContain("Helpfulness: 4.5/5");
    expect(withScores).toContain("Accuracy: 3.2/5");
  });

  it("omits the quality section when the judge was skipped", async () => {
    const output = await captureReport(
      ConsoleReporter.createFresh(),
      createSummary(),
    );

    expect(output).not.toContain("Average Quality Scores");
  });
});
