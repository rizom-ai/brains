import { afterEach, describe, expect, it } from "bun:test";
import { createClient } from "@libsql/client";
import { runPackageMigrations } from "@brains/db";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { migrateJobQueue } from "../src/migrate";

/**
 * The wish:create job type is retired: nothing has enqueued it since the
 * wishlist moved to its create route, and the declared wishlist registers
 * no handler for it. A row still queued is settled as failed with the
 * public no_handler error, so none waits forever.
 */

const journalSchema = z.looseObject({
  entries: z.array(z.looseObject({ tag: z.string() })),
});

let directory: string | undefined;
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

/** A job-queue database migrated as the release before the retirement. */
async function beforeRetirement(): Promise<string> {
  directory = await mkdtemp(join(tmpdir(), "retired-wish-create-"));
  const migrations = new URL("../drizzle/", import.meta.url);
  const earlier = join(directory, "migrations");
  await mkdir(join(earlier, "meta"), { recursive: true });
  const journal = journalSchema.parse(
    JSON.parse(
      await readFile(new URL("meta/_journal.json", migrations), "utf8"),
    ),
  );
  const retirement = journal.entries.findIndex(
    ({ tag }) => tag === "0010_retire_wish_create",
  );
  expect(retirement).toBeGreaterThan(0);
  const kept = journal.entries.slice(0, retirement);
  const files = new Set(kept.map(({ tag }) => `${tag}.sql`));
  for (const name of await readdir(migrations)) {
    if (files.has(name)) {
      await writeFile(
        join(earlier, name),
        await readFile(new URL(name, migrations)),
      );
    }
  }
  await writeFile(
    join(earlier, "meta", "_journal.json"),
    JSON.stringify({ ...journal, entries: kept }),
  );
  const url = `file:${join(directory, "jobs.db")}`;
  await runPackageMigrations({
    label: "job-queue-before-retirement",
    config: { url },
    schema: {},
    migrationsFolder: earlier,
  });
  return url;
}

async function queue(
  url: string,
  rows: Array<{
    id: string;
    type: string;
    status: string;
    attemptId?: string;
  }>,
): Promise<void> {
  const client = createClient({ url });
  for (const row of rows) {
    await client.execute({
      sql: `INSERT INTO job_queue
        (id, type, data, metadata, status, priority, retryCount, maxRetries, createdAt, scheduledFor, attemptId)
        VALUES (?, ?, '{}', '{}', ?, 0, 0, 3, 1, 1, ?)`,
      args: [row.id, row.type, row.status, row.attemptId ?? null],
    });
  }
  client.close();
}

async function rows(url: string): Promise<Record<string, unknown>[]> {
  const client = createClient({ url });
  const result = await client.execute(
    "SELECT id, type, status, lastError, lastErrorPublic, completedAt FROM job_queue ORDER BY id",
  );
  client.close();
  return result.rows.map((row) => ({ ...row }));
}

describe("the retired wish:create job type", () => {
  it("settles a queued wish:create job as failed with the public no_handler error", async () => {
    const url = await beforeRetirement();
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
    const url = await beforeRetirement();
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
