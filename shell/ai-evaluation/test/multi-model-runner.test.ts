import { describe, expect, it } from "bun:test";
import {
  collectModelRuns,
  collectModelSamples,
  exitCodeForModelRuns,
  succeededRuns,
} from "../src/multi-model-runner";
import type { EvaluationResult, EvaluationSummary } from "../src/schemas";

/**
 * The per-model loop, without booting anything. Each model's run is faked, so
 * these cover what the loop does *around* the run: that one model failing does
 * not discard the models that already succeeded, and what exit code the whole
 * comparison should produce.
 */

function summary(
  overrides: Partial<EvaluationSummary> = {},
): EvaluationSummary {
  return {
    timestamp: "2026-08-14T00:00:00.000Z",
    totalTests: 3,
    passedTests: 3,
    failedTests: 0,
    passRate: 1,
    avgMetrics: { totalTokens: 0, toolCallCount: 0, durationMs: 0 },
    results: [],
    ...overrides,
  };
}

describe("collectModelRuns", () => {
  it("returns a summary per model when every model runs", async () => {
    const outcomes = await collectModelRuns(["sonnet", "opus"], async (model) =>
      summary({ totalTests: model === "sonnet" ? 3 : 5 }),
    );

    expect(outcomes.map((outcome) => outcome.model)).toEqual([
      "sonnet",
      "opus",
    ]);
    expect(outcomes[0]?.summary?.totalTests).toBe(3);
    expect(outcomes[1]?.summary?.totalTests).toBe(5);
    expect(outcomes.every((outcome) => outcome.error === undefined)).toBe(true);
  });

  it("keeps going after a model throws, and keeps the earlier results", async () => {
    // The bug this replaces: the throw propagated out of the loop, so the
    // comparison report was never written and every summary already collected
    // was discarded — including models that had passed.
    const outcomes = await collectModelRuns(
      ["sonnet", "broken", "haiku"],
      async (model) => {
        if (model === "broken") throw new Error("no API key for broken");
        return summary();
      },
    );

    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]?.summary).toBeDefined();
    expect(outcomes[2]?.summary).toBeDefined();
  });

  it("records why a model failed rather than dropping it silently", async () => {
    const outcomes = await collectModelRuns(["broken"], async () => {
      throw new Error("no API key for broken");
    });

    expect(outcomes[0]?.model).toBe("broken");
    expect(outcomes[0]?.summary).toBeUndefined();
    expect(outcomes[0]?.error).toContain("no API key for broken");
  });

  it("runs models in the order given, so the report matches the invocation", async () => {
    const started: string[] = [];
    await collectModelRuns(["c", "a", "b"], async (model) => {
      started.push(model);
      return summary();
    });

    expect(started).toEqual(["c", "a", "b"]);
  });
});

function run(testCaseId: string, passed: boolean): EvaluationResult {
  return {
    testCaseId,
    testCaseName: testCaseId,
    passed,
    timestamp: "2026-10-08T00:00:00.000Z",
    turnResults: [],
    totalMetrics: {
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      toolCallCount: 0,
      durationMs: 1,
      turnCount: 1,
    },
    failures: [],
  };
}

describe("collectModelSamples", () => {
  it("runs each sample in order in its own environment and merges them", async () => {
    const started: number[] = [];
    const merged = await collectModelSamples(3, async (sampleIndex) => {
      started.push(sampleIndex);
      return summary({
        totalTests: 1,
        passedTests: sampleIndex === 1 ? 0 : 1,
        failedTests: sampleIndex === 1 ? 1 : 0,
        results: [run("flaky", sampleIndex !== 1)],
      });
    });
    expect(started).toEqual([0, 1, 2]);
    expect(merged.results.map((result) => result.passed)).toEqual([
      true,
      false,
      true,
    ]);
  });
});

describe("succeededRuns", () => {
  it("passes only the models that produced a summary to the reporter", async () => {
    const outcomes = await collectModelRuns(
      ["sonnet", "broken"],
      async (model) => {
        if (model === "broken") throw new Error("boom");
        return summary();
      },
    );

    const reportable = succeededRuns(outcomes);
    expect(reportable).toHaveLength(1);
    expect(reportable[0]?.model).toBe("sonnet");
  });
});

describe("exitCodeForModelRuns", () => {
  it("succeeds when every model ran and every test passed", () => {
    expect(
      exitCodeForModelRuns([
        { model: "sonnet", summary: summary() },
        { model: "opus", summary: summary() },
      ]),
    ).toBe(0);
  });

  it("fails when any model had a failing test", () => {
    expect(
      exitCodeForModelRuns([
        { model: "sonnet", summary: summary() },
        {
          model: "opus",
          summary: summary({
            failedTests: 1,
            passedTests: 2,
            results: [run("a", true), run("b", true), run("c", false)],
          }),
        },
      ]),
    ).toBe(1);
  });

  it("fails when a model could not run at all", () => {
    // Otherwise a broken model reads as success: it contributed no failing
    // tests precisely because it never ran one.
    expect(
      exitCodeForModelRuns([
        { model: "sonnet", summary: summary() },
        { model: "broken", error: "no API key" },
      ]),
    ).toBe(1);
  });

  it("fails when no model ran", () => {
    expect(exitCodeForModelRuns([])).toBe(1);
  });

  it("fails when a model ran no tests", () => {
    // A filter that matches nothing must not read as a pass, as on the
    // single-model path.
    expect(
      exitCodeForModelRuns([
        {
          model: "sonnet",
          summary: summary({
            totalTests: 0,
            passedTests: 0,
            failedTests: 0,
            results: [],
          }),
        },
      ]),
    ).toBe(1);
  });

  it("judges sampled tests by their pass rate", () => {
    const sampled = summary({
      totalTests: 5,
      passedTests: 4,
      failedTests: 1,
      results: [true, false, true, true, true].map((passed) =>
        run("flaky", passed),
      ),
    });
    const outcomes = [{ model: "sonnet", summary: sampled }];
    expect(exitCodeForModelRuns(outcomes)).toBe(1);
    expect(exitCodeForModelRuns(outcomes, 0.8)).toBe(0);
    expect(exitCodeForModelRuns(outcomes, 0.9)).toBe(1);
  });
});
