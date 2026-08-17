import { describe, expect, it } from "bun:test";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { createTempDir } from "@brains/test-utils";
import { JSONReporter } from "../src/reporters/json-reporter";
import type { EvaluationResult, EvaluationSummary } from "../src/schemas";

/**
 * Output shape, not formatting. The JSON file is what a CI run leaves behind
 * for the comparison reporter and for anyone reading results after the fact, so
 * what matters is that the fields survive the round trip and that `latest.json`
 * tracks the newest run.
 */

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
      totalTokens: 0,
      toolCallCount: 0,
      durationMs: 0,
      turnCount: 0,
    },
    failures: [],
    ...overrides,
  };
}

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
    results: [
      createResult(),
      createResult({
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
      }),
    ],
    ...overrides,
  };
}

async function readJson(path: string): Promise<EvaluationSummary> {
  return JSON.parse(await readFile(path, "utf-8")) as EvaluationSummary;
}

describe("JSONReporter", () => {
  it("writes the summary to the named file", async () => {
    const outputDirectory = await createTempDir("eval-json-reporter-");
    const reporter = JSONReporter.createFresh({
      outputDirectory,
      filename: "run.json",
    });

    await reporter.report(createSummary());

    const written = await readJson(join(outputDirectory, "run.json"));
    expect(written.totalTests).toBe(2);
    expect(written.passedTests).toBe(1);
    expect(written.failedTests).toBe(1);
    expect(written.passRate).toBe(0.5);
  });

  it("creates the output directory when it does not exist yet", async () => {
    const root = await createTempDir("eval-json-reporter-");
    const outputDirectory = join(root, "nested", "results");
    const reporter = JSONReporter.createFresh({
      outputDirectory,
      filename: "run.json",
    });

    await reporter.report(createSummary());

    expect((await readdir(outputDirectory)).sort()).toEqual([
      "latest.json",
      "run.json",
    ]);
  });

  it("keeps latest.json pointing at the most recent run", async () => {
    const outputDirectory = await createTempDir("eval-json-reporter-");

    await JSONReporter.createFresh({
      outputDirectory,
      filename: "first.json",
    }).report(createSummary({ totalTests: 2, passedTests: 2, failedTests: 0 }));

    await JSONReporter.createFresh({
      outputDirectory,
      filename: "second.json",
    }).report(createSummary({ totalTests: 9, passedTests: 4, failedTests: 5 }));

    const latest = await readJson(join(outputDirectory, "latest.json"));
    expect(latest.totalTests).toBe(9);
    expect(latest.failedTests).toBe(5);

    // The earlier run is still readable under its own name; latest.json is a
    // pointer at the newest, not a replacement for the history.
    const first = await readJson(join(outputDirectory, "first.json"));
    expect(first.totalTests).toBe(2);
  });

  it("includes per-test failures by default, since that is what a reader needs", async () => {
    const outputDirectory = await createTempDir("eval-json-reporter-");
    const reporter = JSONReporter.createFresh({
      outputDirectory,
      filename: "run.json",
    });

    await reporter.report(createSummary());

    const written = await readJson(join(outputDirectory, "run.json"));
    expect(written.results).toHaveLength(2);
    expect(written.results[1]?.failures[0]?.message).toBe(
      'Response must contain "results"',
    );
  });

  it("drops turn detail but keeps the failure count when full results are off", async () => {
    const outputDirectory = await createTempDir("eval-json-reporter-");
    const reporter = JSONReporter.createFresh({
      outputDirectory,
      filename: "run.json",
      includeFullResults: false,
    });

    await reporter.report(createSummary());

    const written: {
      results?: unknown;
      testResults?: Array<{ testCaseId: string; failureCount: number }>;
    } = JSON.parse(
      await readFile(join(outputDirectory, "run.json"), "utf-8"),
    ) as never;

    expect(written.results).toBeUndefined();
    expect(written.testResults).toHaveLength(2);
    expect(written.testResults?.[1]).toMatchObject({
      testCaseId: "tool-invocation-list",
      failureCount: 1,
    });
  });
});
