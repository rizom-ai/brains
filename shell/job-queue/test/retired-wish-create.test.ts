import { afterEach, describe, expect, it } from "bun:test";
import { migrateJobQueue } from "../src/migrate";
import {
  beforeRetirement,
  queue,
  rows,
  type RetirementDatabase,
} from "./helpers/retired-job-type";

/**
 * The wish:create job type is retired: nothing has enqueued it since the
 * wishlist moved to its create route, and the declared wishlist registers
 * no handler for it. A row still queued is settled as failed with the
 * public no_handler error, so none waits forever.
 */

let database: RetirementDatabase | undefined;
afterEach(async () => {
  await database?.cleanup();
  database = undefined;
});

async function migratedBefore(): Promise<string> {
  database = await beforeRetirement("0010_retire_wish_create");
  return database.url;
}

describe("the retired wish:create job type", () => {
  it("settles a queued wish:create job as failed with the public no_handler error", async () => {
    const url = await migratedBefore();
    await queue(url, [
      { id: "a-queued-wish", type: "wish:create", status: "pending" },
      { id: "b-other-job", type: "note:upload-import", status: "pending" },
      { id: "c-done-wish", type: "wish:create", status: "completed" },
    ]);

    await migrateJobQueue({ url });

    const [wish, other, done] = await rows(url);
    expect(wish).toMatchObject({ id: "a-queued-wish", status: "failed" });
    expect(String(wish?.["lastError"])).toContain("wish:create");
    expect(JSON.parse(String(wish?.["lastErrorPublic"]))).toEqual({
      code: "no_handler",
      message: "No handler is available for this capability",
    });
    expect(Number(wish?.["completedAt"])).toBeGreaterThan(0);
    expect(other).toMatchObject({ id: "b-other-job", status: "pending" });
    expect(done).toMatchObject({ id: "c-done-wish", status: "completed" });
  });

  it("leaves a wish:create attempt a worker still owns to that worker", async () => {
    const url = await migratedBefore();
    await queue(url, [
      {
        id: "owned-wish",
        type: "wish:create",
        status: "processing",
        attemptId: "attempt-1",
      },
    ]);

    await migrateJobQueue({ url });

    expect((await rows(url))[0]).toMatchObject({ status: "processing" });
  });
});
