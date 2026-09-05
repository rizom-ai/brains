/**
 * Production-shaped evidence for the entity/job atomicity decision.
 *
 * Compares the current two-commit gap with two atomic candidates:
 *
 * - entity-local outbox: entity + durable job intent commit together, then a
 *   triggered/startup relay idempotently copies batches into brain-jobs.db;
 * - merged file: entity + job row commit together in one database.
 *
 * The failure probes demonstrate the durability boundary of each topology.
 * Run from the worktree root:
 *
 *   bun scripts/perf-entity-job-atomicity.ts
 *   bun scripts/perf-entity-job-atomicity.ts <turso|libsql>
 *   BRAINS_BENCH_ATOMICITY_OPERATIONS=2000 bun scripts/perf-entity-job-atomicity.ts turso
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createClient,
  type Client,
  type Row,
  type Transaction,
} from "@libsql/client";
import { applySqlitePragmas, createSqliteDatabase } from "@brains/db";

// Historical libSQL baseline belongs to this benchmark, not the runtime.
type SqliteEngine = "libsql" | "turso";

interface OpenDatabase {
  client: Client;
}

interface LatencySummary {
  totalMs: number;
  medianMs: number;
  p95Ms: number;
  operationsPerSecond: number;
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

const OPERATION_COUNT = readPositiveInteger(
  "BRAINS_BENCH_ATOMICITY_OPERATIONS",
  500,
);
const RELAY_BATCH_SIZE = readPositiveInteger(
  "BRAINS_BENCH_ATOMICITY_RELAY_BATCH",
  100,
);

function parseEngines(): SqliteEngine[] {
  const requested = process.argv[2];
  if (requested === undefined) return ["turso", "libsql"];
  if (requested !== "turso" && requested !== "libsql") {
    throw new Error("Engine must be turso or libsql");
  }
  return [requested];
}

async function openDatabase(
  directory: string,
  filename: string,
  engine: SqliteEngine,
): Promise<OpenDatabase> {
  const url = `file:${join(directory, filename)}`;
  const client =
    engine === "libsql"
      ? createClient({ url })
      : createSqliteDatabase({ url, schema: {} }).client;
  await applySqlitePragmas(client, url);
  return { client };
}

async function withWriteTransaction(
  client: Client,
  operation: (transaction: Transaction) => Promise<void>,
): Promise<void> {
  const transaction = await client.transaction("write");
  try {
    await operation(transaction);
    await transaction.commit();
  } catch (error) {
    if (!transaction.closed) await transaction.rollback();
    throw error;
  } finally {
    transaction.close();
  }
}

async function createEntitySchema(
  client: Client,
  includeOutbox: boolean,
): Promise<void> {
  await client.execute(`CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    entityType TEXT NOT NULL,
    content TEXT NOT NULL,
    contentHash TEXT NOT NULL,
    updated INTEGER NOT NULL
  )`);
  await client.execute(`CREATE TABLE projection_dirty_inputs (
    generation INTEGER PRIMARY KEY AUTOINCREMENT,
    sourceType TEXT NOT NULL,
    sourceId TEXT NOT NULL,
    revision TEXT NOT NULL,
    operation TEXT NOT NULL,
    markedAt INTEGER NOT NULL
  )`);
  if (!includeOutbox) return;
  await client.execute(`CREATE TABLE entity_job_outbox (
    id TEXT PRIMARY KEY,
    jobId TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  )`);
  await client.execute(
    "CREATE INDEX idx_entity_job_outbox_delivery ON entity_job_outbox(createdAt, id)",
  );
}

async function createJobSchema(client: Client): Promise<void> {
  await client.execute(`CREATE TABLE job_queue (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    status TEXT NOT NULL,
    priority INTEGER NOT NULL,
    createdAt INTEGER NOT NULL,
    runtimeUpdatedAt INTEGER
  )`);
  await client.execute(
    "CREATE INDEX idx_job_queue_ready ON job_queue(status, priority, createdAt)",
  );
}

function entityInsert(index: number): {
  sql: string;
  args: Array<string | number>;
} {
  return {
    sql: `INSERT INTO entities
      (id, entityType, content, contentHash, updated)
      VALUES (?, 'note', ?, ?, ?)`,
    args: [
      `entity-${index}`,
      `Atomicity benchmark entity ${index}`,
      `hash-${index}`,
      index,
    ],
  };
}

function dirtyInputInsert(index: number): {
  sql: string;
  args: Array<string | number>;
} {
  return {
    sql: `INSERT INTO projection_dirty_inputs
      (sourceType, sourceId, revision, operation, markedAt)
      VALUES ('note', ?, ?, 'upsert', ?)`,
    args: [`entity-${index}`, `revision-${index}`, index],
  };
}

function jobInsert(index: number): {
  sql: string;
  args: Array<string | number>;
} {
  return {
    sql: `INSERT INTO job_queue
      (id, type, data, status, priority, createdAt, runtimeUpdatedAt)
      VALUES (?, 'shell:embedding', ?, 'pending', 0, ?, ?)`,
    args: [
      `job-${index}`,
      JSON.stringify({
        id: `entity-${index}`,
        entityType: "note",
        contentHash: `hash-${index}`,
        operation: "create",
      }),
      index,
      index,
    ],
  };
}

function outboxInsert(index: number): {
  sql: string;
  args: Array<string | number>;
} {
  const job = jobInsert(index);
  return {
    sql: `INSERT INTO entity_job_outbox
      (id, jobId, type, data, createdAt)
      VALUES (?, ?, 'shell:embedding', ?, ?)`,
    args: [
      `outbox-${index}`,
      requireArg(job.args, 0),
      requireArg(job.args, 1),
      index,
    ],
  };
}

function requireArg(
  args: ReadonlyArray<string | number>,
  index: number,
): string | number {
  const value = args[index];
  if (value === undefined) throw new Error(`missing job argument ${index}`);
  return value;
}

function summarize(samples: number[]): LatencySummary {
  if (samples.length === 0) throw new Error("No latency samples collected");
  const sorted = [...samples].sort((left, right) => left - right);
  const totalMs = samples.reduce((sum, sample) => sum + sample, 0);
  const percentile = (fraction: number): number => {
    const value =
      sorted[
        Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)
      ];
    if (value === undefined) throw new Error("percentile out of range");
    return value;
  };
  return {
    totalMs,
    medianMs: percentile(0.5),
    p95Ms: percentile(0.95),
    operationsPerSecond: (samples.length / totalMs) * 1_000,
  };
}

function printLatency(label: string, summary: LatencySummary): void {
  console.log(
    [
      label,
      `${summary.totalMs.toFixed(0)}ms total`,
      `${summary.medianMs.toFixed(2)}ms p50`,
      `${summary.p95Ms.toFixed(2)}ms p95`,
      `${summary.operationsPerSecond.toFixed(0)} ops/s`,
    ].join("\t"),
  );
}

async function measureOperations(
  operation: (index: number) => Promise<void>,
): Promise<LatencySummary> {
  const samples: number[] = [];
  for (let index = 0; index < OPERATION_COUNT; index++) {
    const startedAt = performance.now();
    await operation(index);
    samples.push(performance.now() - startedAt);
  }
  return summarize(samples);
}

function rowString(row: Row, name: string): string {
  const value = row[name];
  if (typeof value !== "string") {
    throw new Error(`Expected ${name} to be a string`);
  }
  return value;
}

async function drainOutbox(options: {
  entityClient: Client;
  jobClient: Client;
  failAfterQueueCommit?: boolean;
}): Promise<number> {
  // Recursive batch drain: each call relays one batch and recurses until a
  // poll finds no pending intents.
  const pending = await options.entityClient.execute({
    sql: `SELECT id, jobId, type, data, createdAt
      FROM entity_job_outbox ORDER BY createdAt, id LIMIT ?`,
    args: [RELAY_BATCH_SIZE],
  });
  if (pending.rows.length === 0) return 0;

  await withWriteTransaction(options.jobClient, async (transaction) => {
    for (const row of pending.rows) {
      await transaction.execute({
        sql: `INSERT INTO job_queue
          (id, type, data, status, priority, createdAt, runtimeUpdatedAt)
          VALUES (?, ?, ?, 'pending', 0, ?, ?)
          ON CONFLICT(id) DO NOTHING`,
        args: [
          rowString(row, "jobId"),
          rowString(row, "type"),
          rowString(row, "data"),
          Number(row["createdAt"]),
          Number(row["createdAt"]),
        ],
      });
    }
  });

  if (options.failAfterQueueCommit) {
    throw new Error("injected relay interruption after queue commit");
  }

  const ids = pending.rows.map((row) => rowString(row, "id"));
  await withWriteTransaction(options.entityClient, async (transaction) => {
    await transaction.execute({
      sql: `DELETE FROM entity_job_outbox
        WHERE id IN (${ids.map(() => "?").join(", ")})`,
      args: ids,
    });
  });
  return pending.rows.length + (await drainOutbox(options));
}

async function scalarCount(client: Client, table: string): Promise<number> {
  const result = await client.execute(`SELECT count(*) AS count FROM ${table}`);
  return Number(result.rows[0]?.["count"] ?? 0);
}

function assertEqual(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${actual}`);
  }
}

async function benchmarkCurrentGap(engine: SqliteEngine): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), `entity-job-gap-${engine}-`));
  const entity = await openDatabase(directory, "brain.db", engine);
  const jobs = await openDatabase(directory, "brain-jobs.db", engine);
  try {
    await createEntitySchema(entity.client, false);
    await createJobSchema(jobs.client);
    printLatency(
      "current gap: entity then enqueue",
      await measureOperations(async (index) => {
        await withWriteTransaction(entity.client, async (transaction) => {
          await transaction.execute(entityInsert(index));
          await transaction.execute(dirtyInputInsert(index));
        });
        await withWriteTransaction(jobs.client, async (transaction) => {
          await transaction.execute(jobInsert(index));
        });
      }),
    );

    const probeIndex = OPERATION_COUNT + 1;
    await withWriteTransaction(entity.client, async (transaction) => {
      await transaction.execute(entityInsert(probeIndex));
      await transaction.execute(dirtyInputInsert(probeIndex));
    });
    assertEqual(
      await scalarCount(entity.client, "entities"),
      OPERATION_COUNT + 1,
      "current gap entity count",
    );
    assertEqual(
      await scalarCount(jobs.client, "job_queue"),
      OPERATION_COUNT,
      "current gap job count",
    );
    console.log("current gap failure probe\tentity=1 job=0 after interruption");
  } finally {
    entity.client.close();
    jobs.client.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

async function benchmarkOutbox(engine: SqliteEngine): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), `entity-job-outbox-${engine}-`));
  const entity = await openDatabase(directory, "brain.db", engine);
  const jobs = await openDatabase(directory, "brain-jobs.db", engine);
  try {
    await createEntitySchema(entity.client, true);
    await createJobSchema(jobs.client);
    printLatency(
      "outbox: entity + durable intent",
      await measureOperations(async (index) => {
        await withWriteTransaction(entity.client, async (transaction) => {
          await transaction.execute(entityInsert(index));
          await transaction.execute(dirtyInputInsert(index));
          await transaction.execute(outboxInsert(index));
        });
      }),
    );

    const relayStartedAt = performance.now();
    const delivered = await drainOutbox({
      entityClient: entity.client,
      jobClient: jobs.client,
    });
    const relayElapsedMs = performance.now() - relayStartedAt;
    assertEqual(delivered, OPERATION_COUNT, "outbox delivered count");
    console.log(
      [
        "outbox: batch relay",
        `${relayElapsedMs.toFixed(0)}ms total`,
        `${(relayElapsedMs / delivered).toFixed(2)}ms/job`,
        `${((delivered / relayElapsedMs) * 1_000).toFixed(0)} jobs/s`,
      ].join("\t"),
    );

    const probeIndex = OPERATION_COUNT + 1;
    await withWriteTransaction(entity.client, async (transaction) => {
      await transaction.execute(entityInsert(probeIndex));
      await transaction.execute(dirtyInputInsert(probeIndex));
      await transaction.execute(outboxInsert(probeIndex));
    });
    try {
      await drainOutbox({
        entityClient: entity.client,
        jobClient: jobs.client,
        failAfterQueueCommit: true,
      });
      throw new Error(
        "Expected the outbox failure probe to interrupt delivery",
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("injected relay interruption")
      ) {
        throw error;
      }
    }
    assertEqual(
      await scalarCount(entity.client, "entity_job_outbox"),
      1,
      "outbox retained intent count",
    );
    assertEqual(
      await scalarCount(jobs.client, "job_queue"),
      OPERATION_COUNT + 1,
      "outbox first delivery job count",
    );
    await drainOutbox({ entityClient: entity.client, jobClient: jobs.client });
    assertEqual(
      await scalarCount(entity.client, "entity_job_outbox"),
      0,
      "outbox recovered intent count",
    );
    assertEqual(
      await scalarCount(jobs.client, "job_queue"),
      OPERATION_COUNT + 1,
      "outbox idempotent replay job count",
    );
    console.log(
      "outbox failure probe\tretained intent replayed to exactly one job",
    );
  } finally {
    entity.client.close();
    jobs.client.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

async function benchmarkMergedFile(engine: SqliteEngine): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), `entity-job-merged-${engine}-`));
  const database = await openDatabase(directory, "brain.db", engine);
  try {
    await createEntitySchema(database.client, false);
    await createJobSchema(database.client);
    printLatency(
      "merged: entity + job",
      await measureOperations(async (index) => {
        await withWriteTransaction(database.client, async (transaction) => {
          await transaction.execute(entityInsert(index));
          await transaction.execute(dirtyInputInsert(index));
          await transaction.execute(jobInsert(index));
        });
      }),
    );

    const rollbackIndex = OPERATION_COUNT + 1;
    try {
      await withWriteTransaction(database.client, async (transaction) => {
        await transaction.execute(entityInsert(rollbackIndex));
        await transaction.execute(dirtyInputInsert(rollbackIndex));
        throw new Error("injected merged transaction interruption");
      });
      throw new Error("Expected the merged failure probe to roll back");
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !error.message.includes("injected merged transaction interruption")
      ) {
        throw error;
      }
    }
    assertEqual(
      await scalarCount(database.client, "entities"),
      OPERATION_COUNT,
      "merged rollback entity count",
    );
    assertEqual(
      await scalarCount(database.client, "job_queue"),
      OPERATION_COUNT,
      "merged rollback job count",
    );
    console.log("merged failure probe\tentity=0 job=0 after rollback");
  } finally {
    database.client.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

console.log(`operations\t${OPERATION_COUNT}\trelay batch\t${RELAY_BATCH_SIZE}`);
for (const engine of parseEngines()) {
  console.log(`\n[${engine}]`);
  await benchmarkCurrentGap(engine);
  await benchmarkOutbox(engine);
  await benchmarkMergedFile(engine);
}
