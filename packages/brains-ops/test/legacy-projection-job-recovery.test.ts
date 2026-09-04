import { afterEach, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";
import { migrateJobQueue } from "@brains/job-queue/migrate";
import { createTempDir } from "@brains/test-utils";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  LEGACY_PROJECTION_RETIREMENT_REASON,
  retireLegacyProjectionJob,
} from "../src/legacy-projection-job-recovery";

const createdDirs: string[] = [];

async function createLegacyJobDatabase(
  overrides: {
    attemptId?: string | null;
    progress?: string | null;
  } = {},
): Promise<{ databasePath: string; jobId: string }> {
  const directory = await createTempDir("legacy-projection-job-");
  createdDirs.push(directory);
  const databasePath = join(directory, "brain-jobs.db");
  await migrateJobQueue({ url: `file:${databasePath}` });

  const database = new Database(databasePath);
  const jobId = "legacy-job";
  try {
    database
      .query(
        `INSERT INTO job_queue (
          id, type, data, status, priority, maxRetries, retryCount, source,
          metadata, createdAt, scheduledFor, startedAt, result, lastError,
          completedAt, attemptId, workerSlotId, workerSessionId,
          leaseExpiresAt, attemptHeartbeatAt, progress, runtimeUpdatedAt
        ) VALUES (
          $id, 'skill:project', '{}', 'processing', 0, 3, 0, NULL,
          '{"operationType":"data_processing","rootJobId":"legacy-job"}',
          1000, 1000, 1100, NULL, NULL, NULL, $attemptId,
          $workerSlotId, $workerSessionId, $leaseExpiresAt,
          $attemptHeartbeatAt, $progress, NULL
        )`,
      )
      .run({
        $id: jobId,
        $attemptId: overrides.attemptId ?? null,
        $workerSlotId: overrides.attemptId ? "worker" : null,
        $workerSessionId: overrides.attemptId ? "session" : null,
        $leaseExpiresAt: overrides.attemptId ? 5_000 : null,
        $attemptHeartbeatAt: overrides.attemptId ? 4_000 : null,
        $progress: overrides.progress ?? null,
      });
  } finally {
    database.close(false);
  }
  return { databasePath, jobId };
}

afterEach(async () => {
  await Promise.all(
    createdDirs
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("retireLegacyProjectionJob", () => {
  it("previews then terminally retires one exact unowned legacy job", async () => {
    const { databasePath, jobId } = await createLegacyJobDatabase();

    const preview = await retireLegacyProjectionJob({
      databasePath,
      jobId,
      jobType: "skill:project",
      dryRun: true,
    });
    expect(preview).toMatchObject({
      retired: false,
      job: { id: jobId, type: "skill:project", status: "processing" },
    });

    const retired = await retireLegacyProjectionJob({
      databasePath,
      jobId,
      jobType: "skill:project",
      confirmation: `retire:${jobId}`,
      now: () => 20_000,
    });
    expect(retired).toMatchObject({
      retired: true,
      job: {
        id: jobId,
        type: "skill:project",
        status: "failed",
        retryCount: 0,
        maxRetries: 3,
        completedAt: 20_000,
      },
    });

    const database = new Database(databasePath, { readonly: true });
    try {
      expect(
        database
          .query(
            "SELECT status, lastError, completedAt, runtimeUpdatedAt FROM job_queue WHERE id = ?",
          )
          .get(jobId),
      ).toEqual({
        status: "failed",
        lastError: LEGACY_PROJECTION_RETIREMENT_REASON,
        completedAt: 20_000,
        runtimeUpdatedAt: 20_000,
      });
    } finally {
      database.close(false);
    }
  });

  it("refuses work with live ownership or partial progress", async () => {
    const owned = await createLegacyJobDatabase({ attemptId: "attempt" });
    const progressed = await createLegacyJobDatabase({ progress: "{}" });

    expect(
      retireLegacyProjectionJob({
        ...owned,
        jobType: "skill:project",
        confirmation: `retire:${owned.jobId}`,
      }),
    ).rejects.toThrow("still has attempt ownership");
    expect(
      retireLegacyProjectionJob({
        ...progressed,
        jobType: "skill:project",
        confirmation: `retire:${progressed.jobId}`,
      }),
    ).rejects.toThrow("contains partial progress or a result");
  });

  it("requires the exact confirmation and expected legacy type", async () => {
    const job = await createLegacyJobDatabase();

    expect(
      retireLegacyProjectionJob({
        ...job,
        jobType: "skill:project",
        confirmation: "retire:other-job",
      }),
    ).rejects.toThrow(`expected --confirm retire:${job.jobId}`);
    expect(
      retireLegacyProjectionJob({
        ...job,
        jobType: "topic:project",
        confirmation: `retire:${job.jobId}`,
      }),
    ).rejects.toThrow("expected topic:project");
  });
});
