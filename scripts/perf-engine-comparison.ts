/**
 * Production-shaped local database comparison for libSQL and Turso.
 *
 * Runs the portable exact-phrase search selected for both database engines.
 * Run from the worktree root:
 *
 *   bun scripts/perf-engine-comparison.ts
 *   bun scripts/perf-engine-comparison.ts <libsql|turso>
 *   BRAINS_BENCH_ENTITY_COUNT=10000 bun scripts/perf-engine-comparison.ts turso
 */
import { cpus, tmpdir } from "node:os";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client, type Transaction } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import {
  applySqlitePragmas,
  createSqliteDatabase,
  type SqliteDatabase,
} from "@brains/db";
import { sql } from "drizzle-orm";

// Historical libSQL baseline belongs to this benchmark, not the runtime.
type SqliteEngine = "libsql" | "turso";

interface OpenDatabase {
  client: Client;
  db: SqliteDatabase;
  url: string;
}

function readPositiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

const ENTITY_COUNT = readPositiveInteger("BRAINS_BENCH_ENTITY_COUNT", 1_000);
const DIMENSIONS = 1_536;
const SEARCH_ITERATIONS = readPositiveInteger(
  "BRAINS_BENCH_SEARCH_ITERATIONS",
  30,
);
const BOOST_ITERATIONS = readPositiveInteger(
  "BRAINS_BENCH_BOOST_ITERATIONS",
  100,
);
const UPDATE_ITERATIONS = Math.min(
  readPositiveInteger("BRAINS_BENCH_UPDATE_ITERATIONS", 200),
  ENTITY_COUNT,
);
const JOB_COUNT = readPositiveInteger("BRAINS_BENCH_JOB_COUNT", 300);

const WORDS = [
  "typescript",
  "database",
  "migration",
  "vector",
  "search",
  "entity",
  "projection",
  "queue",
  "worker",
  "embedding",
  "turso",
  "libsql",
  "runtime",
  "content",
  "markdown",
  "visibility",
  "conversation",
  "semantic",
  "index",
];

function content(index: number): string {
  const picks = Array.from(
    { length: 6 },
    (_, offset) => WORDS[(index * 7 + offset * 5) % WORDS.length],
  );
  return `Note ${index}: ${picks.join(" ")} with narrative filler text about topic ${index % 50}.`;
}

function randomVector(seed: number): string {
  return JSON.stringify(
    Array.from(
      { length: DIMENSIONS },
      (_, index) => Math.sin(seed * 997 + index) * 0.5,
    ),
  );
}

const contents = Array.from({ length: ENTITY_COUNT }, (_, index) =>
  content(index),
);
const vectors = Array.from({ length: ENTITY_COUNT }, (_, index) =>
  randomVector(index),
);

function requireVector(index: number): string {
  const vector = vectors[index % vectors.length];
  if (vector === undefined) throw new Error("benchmark generated no vectors");
  return vector;
}

async function timed(
  label: string,
  operations: number,
  operation: () => Promise<void>,
): Promise<void> {
  const start = performance.now();
  await operation();
  const elapsed = performance.now() - start;
  console.log(
    [
      label,
      `${elapsed.toFixed(0)}ms total`,
      `${(elapsed / operations).toFixed(2)}ms/op`,
      `${((operations / elapsed) * 1_000).toFixed(0)} ops/s`,
    ].join("\t"),
  );
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
  const db = drizzle(client, { schema: {} });
  await applySqlitePragmas(client, url);
  await client.execute("PRAGMA foreign_keys=ON");
  return { client, db, url };
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

async function createEntitySchema(client: Client): Promise<void> {
  await client.execute(`CREATE TABLE entities (
    id TEXT NOT NULL, entityType TEXT NOT NULL, content TEXT NOT NULL,
    contentHash TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'public',
    metadata TEXT NOT NULL DEFAULT '{}', created INTEGER NOT NULL,
    updated INTEGER NOT NULL, PRIMARY KEY (id, entityType))`);
  await client.execute(`CREATE TABLE embeddings (
    entity_id TEXT NOT NULL, entity_type TEXT NOT NULL,
    embedding F32_BLOB(${DIMENSIONS}) NOT NULL, content_hash TEXT NOT NULL,
    PRIMARY KEY (entity_id, entity_type),
    FOREIGN KEY (entity_id, entity_type)
      REFERENCES entities(id, entityType) ON DELETE CASCADE)`);
}

async function hybridSearch(
  database: SqliteDatabase,
  iteration: number,
): Promise<void> {
  const query = WORDS[iteration % WORDS.length] ?? "database";
  const queryVector = vectors[iteration] ?? vectors[0];
  if (!queryVector) throw new Error("Query vector fixture is missing");

  const rows = await database.all(sql`
    SELECT e.id,
      (1.0 - vector_distance_cos(emb.embedding, vector32(${queryVector})) / 2.0) * 0.7
        + CASE WHEN instr(lower(e.content), lower(${query})) > 0
          THEN 0.3 ELSE 0.0 END AS score
    FROM entities e
    JOIN embeddings emb
      ON emb.entity_id = e.id AND emb.entity_type = e.entityType
    ORDER BY score DESC LIMIT 10`);

  if (rows.length !== 10) {
    throw new Error("Hybrid search returned too few rows");
  }
}

async function keywordSearch(
  database: SqliteDatabase,
  iteration: number,
): Promise<void> {
  const query = WORDS[iteration % WORDS.length] ?? "database";
  await database.all(sql`
    SELECT e.id FROM entities e
    WHERE instr(lower(e.content), lower(${query})) > 0 LIMIT 20`);
}

async function benchmarkEntityDatabase(engine: SqliteEngine): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), `perf-entity-${engine}-scan-`));
  const { client, db } = await openDatabase(directory, "brain.db", engine);

  console.log(`\n[entity:${engine}:scan]`);
  try {
    const journal = await client.execute("PRAGMA journal_mode");
    console.log(`journal_mode\t${String(journal.rows[0]?.["journal_mode"])}`);
    await createEntitySchema(client);

    await timed("entity writes", ENTITY_COUNT, async () => {
      for (let index = 0; index < ENTITY_COUNT; index++) {
        const entityId = `e-${index}`;
        const entityContent = contents[index];
        if (!entityContent) throw new Error("Content fixture is missing");
        await withWriteTransaction(client, async (transaction) => {
          await transaction.execute({
            sql: "INSERT INTO entities (id, entityType, content, contentHash, created, updated) VALUES (?, 'note', ?, ?, 1, 1)",
            args: [entityId, entityContent, `hash-${index}`],
          });
        });
      }
    });

    await timed("embedding writes", ENTITY_COUNT, async () => {
      for (let index = 0; index < ENTITY_COUNT; index++) {
        await client.execute({
          sql: "INSERT INTO embeddings VALUES (?, 'note', vector32(?), ?)",
          args: [`e-${index}`, requireVector(index), `hash-${index}`],
        });
      }
    });

    await hybridSearch(db, 0);
    await timed("hybrid search", SEARCH_ITERATIONS, async () => {
      for (let iteration = 0; iteration < SEARCH_ITERATIONS; iteration++) {
        await hybridSearch(db, iteration);
      }
    });

    await keywordSearch(db, 0);
    await timed("keyword lookup", BOOST_ITERATIONS, async () => {
      for (let iteration = 0; iteration < BOOST_ITERATIONS; iteration++) {
        await keywordSearch(db, iteration);
      }
    });

    await timed("atomic update+invalidate", UPDATE_ITERATIONS, async () => {
      for (let index = 0; index < UPDATE_ITERATIONS; index++) {
        const entityId = `e-${index}`;
        const updatedContent = `${contents[index]} updated`;
        await withWriteTransaction(client, async (transaction) => {
          await transaction.execute({
            sql: "UPDATE entities SET content = ?, contentHash = ?, updated = 2 WHERE id = ? AND entityType = 'note'",
            args: [updatedContent, `hash-${index}-v2`, entityId],
          });
          await transaction.execute({
            sql: "DELETE FROM embeddings WHERE entity_id = ? AND entity_type = 'note'",
            args: [entityId],
          });
        });
      }
    });
  } finally {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

async function benchmarkJobDatabase(engine: SqliteEngine): Promise<void> {
  const directory = mkdtempSync(join(tmpdir(), `perf-jobs-${engine}-`));
  const { client } = await openDatabase(directory, "brain-jobs.db", engine);

  console.log(`\n[job:${engine}]`);
  try {
    const journal = await client.execute("PRAGMA journal_mode");
    console.log(`journal_mode\t${String(journal.rows[0]?.["journal_mode"])}`);
    await client.execute(`CREATE TABLE job_queue (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, data TEXT NOT NULL,
      status TEXT NOT NULL, priority INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL, runtimeUpdatedAt INTEGER)`);
    await client.execute(
      "CREATE INDEX idx_job_queue_runtime_updates ON job_queue(runtimeUpdatedAt, id)",
    );

    await timed("job enqueue+claim+complete", JOB_COUNT * 3, async () => {
      for (let index = 0; index < JOB_COUNT; index++) {
        await client.execute({
          sql: "INSERT INTO job_queue (id, type, data, status, createdAt, runtimeUpdatedAt) VALUES (?, 'bench', '{}', 'pending', 1, ?)",
          args: [`job-${index}`, index],
        });
        await client.execute({
          sql: "UPDATE job_queue SET status = 'processing', runtimeUpdatedAt = ? WHERE id = ? AND status = 'pending'",
          args: [index + 1, `job-${index}`],
        });
        await client.execute({
          sql: "UPDATE job_queue SET status = 'completed', runtimeUpdatedAt = ? WHERE id = ?",
          args: [index + 2, `job-${index}`],
        });
      }
    });

    const cursors = Array.from({ length: 100 }, (_, index) => index * 3);
    await timed("cursor page reads", cursors.length * 2, async () => {
      for (const cursor of cursors) {
        await client.execute({
          sql: "SELECT * FROM job_queue WHERE runtimeUpdatedAt = ? AND id > ? ORDER BY id LIMIT 20",
          args: [cursor, ""],
        });
        await client.execute({
          sql: "SELECT * FROM job_queue WHERE runtimeUpdatedAt > ? ORDER BY runtimeUpdatedAt, id LIMIT 20",
          args: [cursor],
        });
      }
    });
  } finally {
    client.close();
    rmSync(directory, { recursive: true, force: true });
  }
}

function parseSelection(): SqliteEngine[] {
  const requestedEngine = process.argv[2];
  if (
    requestedEngine !== undefined &&
    requestedEngine !== "libsql" &&
    requestedEngine !== "turso"
  ) {
    throw new Error("Engine must be libsql or turso");
  }
  if (process.argv[3] !== undefined) {
    throw new Error("Search mode was removed; portable scan is the only mode");
  }
  return requestedEngine ? [requestedEngine] : ["libsql", "turso"];
}

console.log(
  `runtime\t${process.platform}/${process.arch}\t${cpus()[0]?.model ?? "unknown CPU"}`,
);
for (const engine of parseSelection()) {
  await benchmarkEntityDatabase(engine);
  await benchmarkJobDatabase(engine);
}
