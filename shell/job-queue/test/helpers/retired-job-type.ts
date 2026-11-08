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

/**
 * A job-queue database as the release before a retirement migration left
 * it, for the tests that settle a retired job type's queued rows.
 */

const journalSchema = z.looseObject({
  entries: z.array(z.looseObject({ tag: z.string() })),
});

export interface RetirementDatabase {
  readonly url: string;
  cleanup(): Promise<void>;
}

/** A job-queue database migrated up to, not including, `retirementTag`. */
export async function beforeRetirement(
  retirementTag: string,
): Promise<RetirementDatabase> {
  const directory = await mkdtemp(join(tmpdir(), "retired-job-type-"));
  const migrations = new URL("../../drizzle/", import.meta.url);
  const earlier = join(directory, "migrations");
  await mkdir(join(earlier, "meta"), { recursive: true });
  const journal = journalSchema.parse(
    JSON.parse(
      await readFile(new URL("meta/_journal.json", migrations), "utf8"),
    ),
  );
  const retirement = journal.entries.findIndex(
    ({ tag }) => tag === retirementTag,
  );
  if (retirement <= 0) {
    throw new Error(`No migration ${retirementTag} after the first`);
  }
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
  return {
    url,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
}

export async function queue(
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

export async function rows(url: string): Promise<Record<string, unknown>[]> {
  const client = createClient({ url });
  const result = await client.execute(
    "SELECT id, type, status, lastError, lastErrorPublic, completedAt FROM job_queue ORDER BY id",
  );
  client.close();
  return result.rows.map((row) => ({ ...row }));
}
