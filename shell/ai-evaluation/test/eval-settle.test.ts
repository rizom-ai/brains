import { describe, expect, it } from "bun:test";
import { createTempDir } from "@brains/test-utils";
import { writeFile } from "node:fs/promises";
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
