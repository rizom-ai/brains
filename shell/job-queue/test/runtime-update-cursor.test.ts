import { afterEach, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { rejects } from "node:assert/strict";
import { createSilentLogger } from "@brains/test-utils";
import { z } from "@brains/utils/zod";
import { createJobQueueDatabase } from "../src/db";
import { JobQueueRepository } from "../src/job-queue-repository";
import { jobQueue, type InsertJobQueue } from "../src/schema/job-queue";
import { createTestJobQueueDatabase } from "./helpers/test-job-queue-db";

const capturedStatementSchema = z.object({
  sql: z.string(),
  args: z.array(z.unknown()),
});

function job(id: string, updatedAt: number | null): InsertJobQueue {
  return {
    id,
    type: "test:cursor",
    data: "{}",
    metadata: { operationType: "data_processing", rootJobId: id },
    status: "completed",
    createdAt: 1,
    scheduledFor: 1,
    completedAt: updatedAt,
    runtimeUpdatedAt: updatedAt,
  };
}

describe("bounded runtime-update cursors", () => {
  let fixture: Awaited<ReturnType<typeof createTestJobQueueDatabase>>;
  let connection: ReturnType<typeof createJobQueueDatabase>;
  let repository: JobQueueRepository;

  beforeEach(async () => {
    fixture = await createTestJobQueueDatabase();
    connection = createJobQueueDatabase(fixture.config);
    fixture.track(connection.client);
    repository = new JobQueueRepository(
      connection.db,
      connection.client,
      connection.url,
      createSilentLogger(),
    );
  });

  afterEach(async () => {
    await fixture.cleanup();
  });

  for (const limit of [
    -1,
    -100,
    0.5,
    NaN,
    Infinity,
    -Infinity,
    1_001,
    Number.MAX_SAFE_INTEGER,
  ]) {
    it(`rejects page size ${limit} before executing SQL`, async () => {
      await connection.db.insert(jobQueue).values([job("a", 10), job("b", 20)]);
      const execute = spyOn(connection.client, "execute");
      try {
        await rejects(
          repository.getRuntimeUpdates({ updatedAt: 0, jobId: "" }, limit),
          { name: "ZodError" },
        );
        expect(execute).not.toHaveBeenCalled();
      } finally {
        execute.mockRestore();
      }
    });
  }

  it("returns an empty zero-sized page without touching SQLite", async () => {
    const execute = spyOn(connection.client, "execute");
    try {
      expect(
        await repository.getRuntimeUpdates({ updatedAt: 0, jobId: "" }, 0),
      ).toEqual([]);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      execute.mockRestore();
    }
  });

  it("bounds the actual SQL query and seeks through the existing composite index", async () => {
    await connection.db
      .insert(jobQueue)
      .values(
        Array.from({ length: 20 }, (_, i) =>
          job(`job-${String(i).padStart(2, "0")}`, 10),
        ),
      );
    const execute = spyOn(connection.client, "execute");
    try {
      const page = await repository.getRuntimeUpdates(
        { updatedAt: 10, jobId: "job-04" },
        7,
      );
      expect(page.map((update) => update.job.id)).toEqual([
        "job-05",
        "job-06",
        "job-07",
        "job-08",
        "job-09",
        "job-10",
        "job-11",
      ]);
      expect(execute).toHaveBeenCalledTimes(1);
      const statement = capturedStatementSchema.parse(
        execute.mock.calls[0]?.[0],
      );
      expect(statement.sql).toMatch(/limit \?/iu);
      expect(statement.args).toEqual([10, "job-04", 7]);
      const plan = await connection.client.execute({
        sql: `EXPLAIN QUERY PLAN ${statement.sql}`,
        args: [10, "job-04", 7],
      });
      expect(plan.rows.map((row) => String(row["detail"]))).toEqual([
        expect.stringContaining(
          "SEARCH job_queue USING INDEX idx_job_queue_runtime_updates ((runtimeUpdatedAt,id)>(?,?))",
        ),
      ]);
    } finally {
      execute.mockRestore();
    }
  });

  it("pages densely tied timestamps without duplicates, skips or ordering changes", async () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) =>
        job(`m${String(i).padStart(2, "0")}`, 10),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        job(`a${String(i).padStart(2, "0")}`, 20),
      ),
      job("b00", 30),
      job("b01", 30),
      job("z-older", 9),
      job("zz-null", null),
    ];
    await connection.db.insert(jobQueue).values(rows.reverse());
    const expectedPages = [
      ["m05", "m06", "m07", "m08"],
      ["m09", "m10", "m11", "a00"],
      ["a01", "a02", "a03", "a04"],
      ["a05", "b00", "b01"],
    ];
    let cursor = { updatedAt: 10, jobId: "m04" };
    for (const expected of expectedPages) {
      const page = await repository.getRuntimeUpdates(cursor, 4);
      expect(page.map((update) => update.job.id)).toEqual(expected);
      for (const update of page) {
        if (update.job.runtimeUpdatedAt === null)
          throw new Error("Cursor query returned a null timestamp");
        expect(update.cursor).toEqual({
          updatedAt: update.job.runtimeUpdatedAt,
          jobId: update.job.id,
        });
      }
      const last = page.at(-1);
      if (!last) throw new Error("Missing cursor fixture page");
      cursor = last.cursor;
    }
    expect(cursor).toEqual({ updatedAt: 30, jobId: "b01" });
    expect(await repository.getRuntimeUpdates(cursor, 4)).toEqual([]);
  });

  it("accepts the existing 1000-row service page size and resumes at the exact boundary", async () => {
    await connection.db
      .insert(jobQueue)
      .values(
        Array.from({ length: 1_001 }, (_, i) =>
          job(`bulk-${String(i).padStart(4, "0")}`, 10),
        ),
      );
    const first = await repository.getRuntimeUpdates(
      { updatedAt: 0, jobId: "" },
      1_000,
    );
    expect(first).toHaveLength(1_000);
    const last = first.at(-1);
    if (!last) throw new Error("Missing full cursor fixture page");
    expect(last.cursor).toEqual({ updatedAt: 10, jobId: "bulk-0999" });
    const second = await repository.getRuntimeUpdates(last.cursor, 1_000);
    expect(second.map((update) => update.job.id)).toEqual(["bulk-1000"]);
    expect(second[0]?.cursor).toEqual({ updatedAt: 10, jobId: "bulk-1000" });
  });
});
