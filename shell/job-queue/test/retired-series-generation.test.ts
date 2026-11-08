import { afterEach, describe, expect, it } from "bun:test";
import { migrateJobQueue } from "../src/migrate";
import {
  beforeRetirement,
  queue,
  rows,
  type RetirementDatabase,
} from "./helpers/retired-job-type";

/**
 * The series:generation job type is retired: series are derived and
 * described by the series projection, and the declared series registers no
 * handler for it. A row still queued is settled as failed with the public
 * no_handler error, so none waits forever.
 */

let database: RetirementDatabase | undefined;
afterEach(async () => {
  await database?.cleanup();
  database = undefined;
});

async function migratedBefore(): Promise<string> {
  database = await beforeRetirement("0011_retire_series_generation");
  return database.url;
}

describe("the retired series:generation job type", () => {
  it("settles a queued series:generation job as failed with the public no_handler error", async () => {
    const url = await migratedBefore();
    await queue(url, [
      { id: "a-queued-series", type: "series:generation", status: "pending" },
      { id: "b-other-job", type: "post:generation", status: "pending" },
      { id: "c-done-series", type: "series:generation", status: "completed" },
    ]);

    await migrateJobQueue({ url });

    const [series, other, done] = await rows(url);
    expect(series).toMatchObject({ id: "a-queued-series", status: "failed" });
    expect(String(series?.["lastError"])).toContain("series:generation");
    expect(JSON.parse(String(series?.["lastErrorPublic"]))).toEqual({
      code: "no_handler",
      message: "No handler is available for this capability",
    });
    expect(Number(series?.["completedAt"])).toBeGreaterThan(0);
    expect(other).toMatchObject({ id: "b-other-job", status: "pending" });
    expect(done).toMatchObject({ id: "c-done-series", status: "completed" });
  });

  it("leaves a series:generation attempt a worker still owns to that worker", async () => {
    const url = await migratedBefore();
    await queue(url, [
      {
        id: "owned-series",
        type: "series:generation",
        status: "processing",
        attemptId: "attempt-1",
      },
    ]);

    await migrateJobQueue({ url });

    expect((await rows(url))[0]).toMatchObject({ status: "processing" });
  });
});
