import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { blob, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { STAGE_CHUNK_BYTES, type StageClaim } from "./binary-protocol";
import {
  withBinaryTransaction,
  type BinaryTransactionContext,
} from "./binary-transaction";
import type { TursoThreadProof } from "./client";

const payloads = sqliteTable("proof_payloads", {
  id: text("id").primaryKey(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
  size: integer("size").notNull(),
});
const references = sqliteTable("proof_references", {
  id: text("id").primaryKey(),
  payload: text("payload").notNull(),
});
const effects = sqliteTable("proof_effects", { id: text("id").primaryKey() });
const payloadSize = 65539;

async function stage(driver: TursoThreadProof): Promise<StageClaim> {
  const scope = await driver.openBinaryScope();
  try {
    const capability = await scope.begin({
      reservationBytes: payloadSize,
      expectedSize: payloadSize,
    });
    // Only one bounded producer chunk exists on the caller. Assembly and SHA-256
    // run on the persistence worker; the expected digest is a fixed fixture fact.
    const chunk = new Uint8Array(STAGE_CHUNK_BYTES).fill(0x5a);
    for (let offset = 0; offset < payloadSize; offset += chunk.byteLength) {
      await scope.append(
        capability,
        offset,
        chunk.subarray(0, Math.min(chunk.byteLength, payloadSize - offset)),
      );
    }
    const sealed = await scope.seal(capability);
    assert.equal(sealed.sizeBytes, payloadSize);
    assert.equal(
      sealed.sha256,
      "82abcd7b965a2c75bef1461e9f5206f47621c1bdeda0aa75de8714ba73dabccc",
    );
    return await scope.reserve(capability);
  } finally {
    // A reserved mutation, including one waiting to acquire its native lease,
    // survives producer revocation until it is explicitly settled.
    await scope.close();
  }
}

async function insert(
  context: BinaryTransactionContext,
  claim: StageClaim,
  id: string,
): Promise<void> {
  const result = await context.executeBound(
    context.db
      .insert(payloads)
      .values({
        id,
        bytes: sql`${sql.placeholder("payload")}`,
        size: payloadSize,
      })
      .returning({ id: payloads.id }),
    new Map([["payload", claim]]),
  );
  assert.equal(result.rows[0]?.[0], id);
  await context.db.insert(references).values({ id, payload: id });
  await context.db.insert(effects).values({ id });
  assert.equal(
    (
      await context.db
        .select()
        .from(references)
        .where(eq(references.id, id))
        .get()
    )?.id,
    id,
  );
}

export async function assertStagedRows(
  driver: TursoThreadProof,
): Promise<void> {
  // This uniform fixture can be compared completely inside SQLite. This is not
  // the proposed generic streaming verification/read-capability implementation.
  const rows = await driver.execute({
    sql: "SELECT id, length(bytes) AS size, replace(hex(bytes), '5A', '') = '' AS exact FROM proof_payloads ORDER BY id",
  });
  assert.equal(rows.rows.length, 1);
  const row = rows.rows[0];
  assert.ok(row);
  assert.equal(row["id"], "payload");
  assert.equal(row["size"], payloadSize);
  assert.equal(row["exact"], 1);
  for (const table of ["proof_references", "proof_effects"]) {
    const result = await driver.execute({
      sql: `SELECT id FROM ${table} ORDER BY id`,
    });
    assert.deepEqual(
      result.rows.map((row) => row["id"]),
      ["payload"],
    );
  }
}

export async function exerciseStagedBinaries(
  driver: TursoThreadProof,
): Promise<void> {
  await driver.execute({ sql: "PRAGMA foreign_keys = ON" });
  await driver.execute({
    sql: "CREATE TABLE proof_payloads (id TEXT PRIMARY KEY, bytes BLOB NOT NULL CHECK(typeof(bytes) = 'blob'), size INTEGER NOT NULL CHECK(size = length(bytes)))",
  });
  await driver.execute({
    sql: "CREATE TABLE proof_references (id TEXT PRIMARY KEY, payload TEXT NOT NULL REFERENCES proof_payloads(id))",
  });
  await driver.execute({
    sql: "CREATE TABLE proof_effects (id TEXT PRIMARY KEY)",
  });
  const committed = await stage(driver);
  await withBinaryTransaction(driver, [committed], async (context) => {
    await context.transaction(async (child) =>
      child.transaction(async (grandchild) =>
        insert(grandchild, committed, "payload"),
      ),
    );
    await assert.rejects(
      context.transaction(async (child) => {
        await insert(child, committed, "nested-rollback");
        throw new Error("Deliberate nested rollback");
      }),
      /Deliberate nested rollback/,
    );
    assert.equal((await driver.stageStats()).attached, 1);
  });
  const rolledBack = await stage(driver);
  await assert.rejects(
    withBinaryTransaction(driver, [rolledBack], async (context) => {
      await context.transaction(async (child) =>
        insert(child, rolledBack, "rollback"),
      );
      throw new Error("Deliberate mutation rollback");
    }),
    /Deliberate mutation rollback/,
  );
  assert.deepEqual(await driver.stageStats(), {
    reservedBytes: 0,
    stages: 0,
    scopes: 0,
    claims: 0,
    attached: 0,
  });
  await assertStagedRows(driver);
}
