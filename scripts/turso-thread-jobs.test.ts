// Isolated consumer proof: actual repository, injected test driver, no runtime factory change.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { migrate } from "drizzle-orm/libsql/migrator";
import { createSilentLogger } from "@brains/test-utils";
import {
  JobQueueRepository,
  type AtomicJobData,
  type JobAttemptClaim,
} from "../shell/job-queue/src/job-queue-repository";
import {
  jobQueue,
  jobWorkerSessions,
} from "../shell/job-queue/src/schema/job-queue";
import { SqlWorkerDriver } from "../shared/db/src/turso-worker/client";
import { SqlWorkerClient } from "../shared/db/src/turso-worker/sql-client";
import { createWorkerDatabase } from "../shared/db/src/turso-worker/binary-transaction";

const workerUrl = new URL(
  "../shared/db/src/turso-worker/worker.ts",
  import.meta.url,
);
const drivers: SqlWorkerDriver[] = [];
let folder: string;
async function open(
  path: string,
  initialize = true,
): Promise<{ driver: SqlWorkerDriver; repository: JobQueueRepository }> {
  const url = pathToFileURL(path).href;
  const driver = new SqlWorkerDriver({ url, workerUrl });
  drivers.push(driver);
  const db = createWorkerDatabase<Record<string, unknown>>(driver, {
    jobQueue,
    jobWorkerSessions,
  });
  const client = new SqlWorkerClient(driver);
  if (initialize)
    await migrate(db, {
      migrationsFolder: fileURLToPath(
        new URL("../shell/job-queue/drizzle", import.meta.url),
      ),
    });
  const repository = new JobQueueRepository(
    db,
    client,
    url,
    createSilentLogger(),
  );
  return { driver, repository };
}
beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), "brains-thread-jobs-"));
});
afterEach(async () => {
  const results = await Promise.allSettled(
    drivers.splice(0).map((driver) => driver.close()),
  );
  const errors = results.flatMap((result) =>
    result.status === "rejected" ? [result.reason] : [],
  );
  try {
    await rm(folder, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }
  if (errors.length)
    throw new AggregateError(errors, "Job proof cleanup failed");
});
function job(
  id: string,
  overrides: Partial<AtomicJobData> = {},
): AtomicJobData {
  return {
    id,
    type: "proof:job",
    data: JSON.stringify({ id: "entity-1", text: "COMMIT; BEGIN; 你好" }),
    status: "pending",
    priority: 0,
    retryCount: 0,
    maxRetries: 2,
    lastError: null,
    createdAt: 1000,
    scheduledFor: 1000,
    startedAt: null,
    completedAt: null,
    source: "thread-proof",
    metadata: {
      operationType: "data_processing",
      rootJobId: "root-1",
      deduplicationKey: "entity-1",
    },
    result: null,
    ...overrides,
  };
}
function claim(
  attemptId: string,
  workerSlotId: string,
  workerSessionId: string,
  now: number,
): JobAttemptClaim {
  return {
    attemptId,
    workerSlotId,
    workerSessionId,
    now,
    leaseDurationMs: 10,
    executableTypes: ["proof:job"],
  };
}

describe("real job repository on the isolated Turso thread", () => {
  it("preserves atomic enqueue, JSON lookup, deduplication rollback and committed rows after restore", async () => {
    const path = join(folder, "jobs.db");
    const { driver, repository } = await open(path);
    expect(
      await repository.enqueueAtomic({
        jobData: job("first"),
        idempotent: true,
      }),
    ).toEqual({ kind: "inserted", jobId: "first" });
    expect(
      await repository.enqueueAtomic({
        jobData: job("first"),
        idempotent: true,
      }),
    ).toEqual({ kind: "replayed", jobId: "first" });
    expect(
      await repository.enqueueAtomic({
        jobData: job("ignored"),
        strategy: "skip",
        deduplicationKey: "entity-1",
      }),
    ).toEqual({ kind: "skipped", jobId: "first" });
    await repository.enqueueAtomic({
      jobData: job("collision", {
        type: "other:job",
        metadata: { operationType: "data_processing", rootJobId: "other-root" },
      }),
    });
    let rollbackCallbacks = 0;
    await assert.rejects(
      repository.enqueueAtomic({
        jobData: job("collision"),
        strategy: "replace",
        deduplicationKey: "entity-1",
        onInsertRollback: () => {
          rollbackCallbacks++;
        },
      }),
    );
    expect(rollbackCallbacks).toBe(1);
    expect((await repository.getStatus("first"))?.status).toBe("pending");
    expect((await repository.getStatus("collision"))?.type).toBe("other:job");
    expect(
      await repository.enqueueAtomic({
        jobData: job("replacement"),
        strategy: "replace",
        deduplicationKey: "entity-1",
      }),
    ).toEqual({
      kind: "replaced",
      jobId: "replacement",
      replacedJobId: "first",
    });
    expect((await repository.getStatus("first"))?.status).toBe("failed");
    expect(
      (await repository.getJobsByRootJobId("root-1"))
        .map((row) => row.id)
        .sort(),
    ).toEqual(["first", "replacement"]);
    expect((await repository.getStatusByEntityId("entity-1"))?.data).toBe(
      job("first").data,
    );
    const expected = await repository.getStatus("replacement");
    expect(expected?.status).toBe("pending");
    await driver.close();
    const restoredPath = join(folder, "restored.db");
    await cp(path, restoredPath, { errorOnExist: true, force: false });
    const restored = await open(restoredPath, false);
    expect(await restored.repository.getStatus("replacement")).toEqual(
      expected,
    );
    expect(
      (await restored.driver.execute({ sql: "PRAGMA integrity_check" }))
        .rows[0]?.[0],
    ).toBe("ok");
  });

  it("executes CASE/subquery claims, expired-owner reclaim and stale-attempt fencing without polling", async () => {
    const { repository } = await open(join(folder, "claims.db"));
    await repository.enqueueAtomic({ jobData: job("claimed") });
    await repository.insert({
      ...job("not-executable", { type: "other:job" }),
      runtimeUpdatedAt: 0,
    });
    await repository.startWorkerSession("slot-a", "session-a", 1000, 50);
    await repository.startWorkerSession("slot-b", "session-b", 1000, 1000);
    await repository.startWorkerSession("slot-c", "session-c", 1000, 1000);
    const initial = await repository.claimNextReady(
      claim("attempt-a", "slot-a", "session-a", 1000),
    );
    expect(initial?.id).toBe("claimed");
    expect(initial?.attemptId).toBe("attempt-a");
    // Lease expiration alone cannot steal from a live owner session.
    expect(
      await repository.claimNextReady(
        claim("too-early", "slot-b", "session-b", 1020),
      ),
    ).toBeNull();
    const contenders = await Promise.all([
      repository.claimNextReady(
        claim("attempt-b", "slot-b", "session-b", 1060),
      ),
      repository.claimNextReady(
        claim("attempt-c", "slot-c", "session-c", 1060),
      ),
    ]);
    const winners = contenders.filter((row) => row !== null);
    expect(winners).toHaveLength(1);
    const winner = winners[0];
    if (!winner?.attemptId) throw new Error("Missing winning attempt");
    expect(winner.retryCount).toBe(1);
    expect(
      await repository.complete("claimed", { stale: true }, "attempt-a"),
    ).toBe(false);
    expect(
      await repository.renewAttemptLease("claimed", "attempt-a", 1070, 10),
    ).toBe(false);
    expect(
      await repository.renewAttemptLease("claimed", winner.attemptId, 1070, 10),
    ).toBe(true);
    const result = { text: "完成", count: 3, nested: { ok: true } };
    expect(await repository.complete("claimed", result, winner.attemptId)).toBe(
      true,
    );
    expect((await repository.getStatus("claimed"))?.result).toEqual(result);
    expect((await repository.getStatus("not-executable"))?.status).toBe(
      "pending",
    );
    const first = await repository.getRuntimeUpdates(
      { updatedAt: 0, jobId: "" },
      1,
    );
    expect(first).toHaveLength(1);
    const cursor = first[0]?.cursor;
    if (!cursor) throw new Error("Missing runtime cursor");
    const second = await repository.getRuntimeUpdates(cursor, 1);
    expect(second).toHaveLength(1);
    const last = second[0]?.cursor;
    if (!last) throw new Error("Missing final cursor");
    expect([...first, ...second].map((entry) => entry.job.id).sort()).toEqual([
      "claimed",
      "not-executable",
    ]);
    expect(await repository.getRuntimeUpdates(last, 1)).toEqual([]);
  });

  it("terminally reclaims exhausted jobs when an owner session is replaced", async () => {
    const { repository } = await open(join(folder, "terminal.db"));
    await repository.enqueueAtomic({
      jobData: job("exhausted", { maxRetries: 0 }),
    });
    await repository.startWorkerSession("slot", "old-session", 1000, 1000);
    expect(
      (
        await repository.claimNextReady(
          claim("old-attempt", "slot", "old-session", 1000),
        )
      )?.id,
    ).toBe("exhausted");
    await repository.startWorkerSession("slot", "new-session", 1001, 1000);
    expect(await repository.endWorkerSession("slot", "old-session")).toBe(
      false,
    );
    expect(
      await repository.heartbeatWorkerSession("slot", "old-session", 1001),
    ).toBe(false);
    expect(
      await repository.claimNextReady(
        claim("new-attempt", "slot", "new-session", 1001),
      ),
    ).toBeNull();
    expect(await repository.getStatus("exhausted")).toMatchObject({
      status: "failed",
      retryCount: 1,
      startedAt: 1000,
      completedAt: 1001,
      lastError: "Attempt lease expired",
    });
    expect(await repository.complete("exhausted", {}, "old-attempt")).toBe(
      false,
    );
  });
});
