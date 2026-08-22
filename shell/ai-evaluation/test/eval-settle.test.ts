import { describe, expect, it } from "bun:test";
import { createTempDir } from "@brains/test-utils";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  hasPrebuiltEvalDatabase,
  waitForIndexReadiness,
  waitForJobsToDrain,
} from "../src/eval-settle";

describe("hasPrebuiltEvalDatabase", () => {
  it("reports whether the prepared environment copied a prebuilt entity database", async () => {
    const dir = await createTempDir("eval-settle-");
    const evalDbBase = join(dir, "brain-eval-1");

    expect(hasPrebuiltEvalDatabase(evalDbBase)).toBe(false);

    await writeFile(`${evalDbBase}.db`, "prebuilt");
    expect(hasPrebuiltEvalDatabase(evalDbBase)).toBe(true);
  });
});

describe("waitForJobsToDrain", () => {
  it("polls until the job queue reports no active jobs", async () => {
    let polls = 0;
    const jobQueue = {
      getActiveJobs: (): Promise<Array<{ type: string }>> => {
        polls += 1;
        return Promise.resolve(
          polls < 3 ? [{ type: "entity-ingest" }, { type: "embedding" }] : [],
        );
      },
    };

    await waitForJobsToDrain(jobQueue, { pollIntervalMs: 1 });

    expect(polls).toBe(3);
  });
});

describe("waitForIndexReadiness", () => {
  const status = {
    ready: true,
    degraded: false,
    activeEmbeddingJobs: 0,
    missingEmbeddings: 0,
    staleEmbeddings: 0,
    failedEmbeddings: 0,
  };

  it("resolves when the index reports ready", async () => {
    const entityService = {
      awaitIndexReady: (): Promise<typeof status> => Promise.resolve(status),
    };

    await waitForIndexReadiness(entityService);
  });

  it("throws when the index never becomes ready", async () => {
    const entityService = {
      awaitIndexReady: (): Promise<typeof status> =>
        Promise.resolve({ ...status, ready: false, missingEmbeddings: 4 }),
    };

    let failure: unknown;
    try {
      await waitForIndexReadiness(entityService);
    } catch (error) {
      failure = error;
    }
    expect(String(failure)).toMatch(/not ready/);
  });
});

describe("evaluation runners settle DB-less environments", () => {
  const runnerSources = [
    "single-model-runner.ts",
    "multi-model-runner.ts",
  ] as const;

  for (const runnerSource of runnerSources) {
    it(`${runnerSource} drains ingestion jobs before running without a prebuilt database`, async () => {
      const source = await readFile(
        join(import.meta.dir, "..", "src", runnerSource),
        "utf8",
      );

      const prebuiltCheckIndex = source.indexOf("hasPrebuiltEvalDatabase(");
      const bootIndex = source.indexOf("await bootEvalApp(");
      const drainIndices = [
        ...source.matchAll(/await waitForJobsToDrain\(/g),
      ].map((match) => match.index);
      const evaluationIndex = source.lastIndexOf(
        runnerSource === "multi-model-runner.ts"
          ? "runEvaluationsCollect("
          : "runEvaluations(",
      );
      const shutdownIndex = source.lastIndexOf("await shell.shutdown()");

      expect(prebuiltCheckIndex).toBeGreaterThan(-1);
      expect(drainIndices).toHaveLength(2);
      // The prebuilt check must read the filesystem before boot creates the
      // database file. Ingestion settles after boot, and case-triggered work
      // settles again before shutdown marks the Shell uninitialized.
      expect(prebuiltCheckIndex).toBeLessThan(bootIndex);
      expect(drainIndices[0]).toBeGreaterThan(bootIndex);
      expect(drainIndices[1]).toBeGreaterThan(evaluationIndex);
      expect(shutdownIndex).toBeGreaterThan(drainIndices[1] ?? Infinity);
    });
  }
});
