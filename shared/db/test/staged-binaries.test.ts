import { afterEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { blob, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import {
  TursoThreadProof,
  type ProofTransaction,
} from "./fixtures/turso-thread/client";
import {
  STAGE_BUDGET_BYTES,
  STAGE_CHUNK_BYTES,
  STAGE_SLOTS,
  type StageCapability,
  type StageClaim,
} from "./fixtures/turso-thread/binary-protocol";
import { withBinaryTransaction } from "./fixtures/turso-thread/binary-transaction";
import type { BinaryScope } from "./fixtures/turso-thread/binary-client";

const workerUrl = new URL("./fixtures/turso-thread/worker.ts", import.meta.url);
const drivers: TursoThreadProof[] = [];
function create(maxInFlight?: number): TursoThreadProof {
  const driver = new TursoThreadProof({
    url: "file::memory:",
    workerUrl,
    ...(maxInFlight !== undefined && { maxInFlight }),
  });
  drivers.push(driver);
  return driver;
}
afterEach(async () => {
  await Promise.all(drivers.splice(0).map((driver) => driver.close()));
});
async function prepared(driver: TursoThreadProof): Promise<{
  scope: BinaryScope;
  capability: StageCapability;
  claim: StageClaim;
}> {
  const scope = await driver.openBinaryScope();
  const capability = await scope.begin({
    reservationBytes: 8,
    expectedSize: 3,
  });
  await scope.append(capability, 0, Uint8Array.of(0, 128, 255));
  await scope.seal(capability);
  return { scope, capability, claim: await scope.reserve(capability) };
}
const failures = sqliteTable("failures", {
  id: integer("id").primaryKey(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
});

describe("worker-resident staged binary proof", () => {
  it("seals visible bytes, retains the allocation charge and invalidates spent capabilities", async () => {
    const driver = create();
    const scope = await driver.openBinaryScope();
    const capability = await scope.begin({ reservationBytes: 8 });
    const backing = new Uint8Array(1024 * 1024);
    const bytes = backing.subarray(17, 20);
    bytes.set([0, 128, 255]);
    await scope.append(capability, 0, bytes);
    bytes.fill(9);
    const sealed = await scope.seal(capability);
    expect(sealed.sizeBytes).toBe(3);
    expect(sealed.sha256).toBe(
      createHash("sha256")
        .update(Uint8Array.of(0, 128, 255))
        .digest("hex"),
    );
    expect(backing.byteLength).toBe(1024 * 1024);
    expect((await driver.stageStats()).reservedBytes).toBe(8);
    await assert.rejects(
      scope.append(capability, 3, Uint8Array.of(1)),
      /sealed/,
    );
    const claim = await scope.reserve(capability);
    await assert.rejects(scope.reserve(capability), /not available/);
    await assert.rejects(scope.discard(capability), /Claimed/);
    await driver.binary({ action: "releaseClaim", claim });
    await scope.discard(capability);
    await assert.rejects(scope.reserve(capability), /Unknown/);
    const next = await scope.begin({ reservationBytes: 0 });
    expect(next.id).toBeGreaterThan(capability.id);
    await scope.close();
    expect((await driver.stageStats()).stages).toBe(0);
  });

  it("binds an empty sealed stage as a zero-length BLOB rather than NULL", async () => {
    const driver = create();
    const scope = await driver.openBinaryScope();
    const capability = await scope.begin({
      reservationBytes: 0,
      expectedSize: 0,
    });
    await scope.seal(capability);
    const claim = await scope.reserve(capability);
    const transaction = await driver.transaction("write", [claim]);
    try {
      const result = await transaction.executeBound({
        sql: "SELECT typeof(?) AS kind, length(?) AS size",
        args: [
          { kind: "resident", claim },
          { kind: "resident", claim },
        ],
      });
      expect(result.rows[0]?.["kind"]).toBe("blob");
      expect(result.rows[0]?.["size"]).toBe(0);
    } finally {
      await transaction.rollback();
    }
  });

  it("releases malformed, incomplete and digest-mismatched stages", async () => {
    const driver = create();
    const scope = await driver.openBinaryScope();
    await assert.rejects(
      scope.begin({ reservationBytes: 1, expectedSize: 2 }),
      /reservation/,
    );
    const outOfOrder = await scope.begin({ reservationBytes: 3 });
    await assert.rejects(
      scope.append(outOfOrder, 1, Uint8Array.of(1)),
      /order/,
    );
    const incomplete = await scope.begin({
      reservationBytes: 3,
      expectedSize: 3,
    });
    await scope.append(incomplete, 0, Uint8Array.of(1));
    await assert.rejects(scope.seal(incomplete), /mismatch/);
    const corrupt = await scope.begin({
      reservationBytes: 1,
      expectedDigest: "0".repeat(64),
    });
    await scope.append(corrupt, 0, Uint8Array.of(1));
    await assert.rejects(scope.seal(corrupt), /mismatch/);
    expect((await driver.stageStats()).reservedBytes).toBe(0);
    expect((await driver.stageStats()).stages).toBe(0);
  });

  it("rejects cross-scope and cross-generation operations without consuming the rightful stage", async () => {
    const first = create();
    const second = create();
    const owner = await first.openBinaryScope();
    const peer = await first.openBinaryScope();
    const other = await second.openBinaryScope();
    const capability = await owner.begin({ reservationBytes: 0 });
    await assert.rejects(peer.seal(capability), /Foreign/);
    await assert.rejects(other.seal(capability), /Foreign/);
    await owner.seal(capability);
    const claim = await owner.reserve(capability);
    const ownSecond = await prepared(second);
    await assert.rejects(
      second.transaction("write", [ownSecond.claim, claim]),
      /Foreign/,
    );
    expect((await second.stageStats()).attached).toBe(0);
    await first.binary({ action: "releaseClaim", claim });
    await second.binary({ action: "releaseClaim", claim: ownSecond.claim });
  });

  it("enforces byte and slot quotas and retains claims after producer closure", async () => {
    const driver = create();
    const owner = await driver.openBinaryScope();
    const peer = await driver.openBinaryScope();
    const maximum = await owner.begin({
      reservationBytes: STAGE_BUDGET_BYTES,
      expectedSize: 0,
    });
    await owner.seal(maximum);
    const claim = await owner.reserve(maximum);
    await owner.close();
    await assert.rejects(peer.begin({ reservationBytes: 1 }), /capacity/);
    expect((await driver.stageStats()).reservedBytes).toBe(STAGE_BUDGET_BYTES);
    await driver.binary({ action: "releaseClaim", claim });
    for (let index = 0; index < STAGE_SLOTS; index++)
      await peer.begin({ reservationBytes: 0 });
    await assert.rejects(peer.begin({ reservationBytes: 0 }), /capacity/);
    await peer.close();
    expect((await driver.stageStats()).stages).toBe(0);
  });

  it("requires an attached live claim and drains admitted binds before commit", async () => {
    const driver = create();
    const { scope, claim } = await prepared(driver);
    const unrelated = await driver.transaction();
    try {
      await assert.rejects(
        unrelated.executeBound({
          sql: "SELECT length(?)",
          args: [{ kind: "resident", claim }],
        }),
        /another transaction/,
      );
    } finally {
      await unrelated.rollback();
    }
    const transaction = await driver.transaction("write", [claim]);
    try {
      await assert.rejects(
        driver.binary({ action: "releaseClaim", claim }),
        /attached/,
      );
      await scope.close();
      await assert.rejects(
        transaction.executeBound({
          sql: "SELECT length(?)",
          args: [
            { kind: "resident", claim: { ...claim, claimId: randomUUID() } },
          ],
        }),
        /Invalid mutation claim/,
      );
      const bound = transaction.executeBound({
        sql: "SELECT length(?) AS size, hex(?) AS bytes",
        args: [
          { kind: "resident", claim },
          { kind: "resident", claim },
        ],
      });
      const commit = transaction.commit();
      const result = await bound;
      expect(result.rows[0]?.["size"]).toBe(3);
      expect(result.rows[0]?.["bytes"]).toBe("0080FF");
      await commit;
    } finally {
      await transaction.rollback();
    }
    expect((await driver.stageStats()).reservedBytes).toBe(0);
    await assert.rejects(driver.transaction("write", [claim]), /Unknown/);
  });

  it("pins a queued transaction's bytes across scope revocation and owner shutdown", async () => {
    const driver = create();
    const { scope, claim } = await prepared(driver);
    const blocker = await driver.transaction();
    let transaction: ProofTransaction | undefined;
    const next = driver.transaction("write", [claim]);
    try {
      expect((await driver.stageStats()).attached).toBe(1);
      await scope.close();
      const closing = driver.close();
      await blocker.rollback();
      transaction = await next;
      const result = await transaction.executeBound({
        sql: "SELECT hex(?) AS bytes",
        args: [{ kind: "resident", claim }],
      });
      expect(result.rows[0]?.["bytes"]).toBe("0080FF");
      await transaction.commit();
      await closing;
      await assert.rejects(
        driver.binary({ action: "releaseClaim", claim }),
        /closed/,
      );
    } finally {
      await blocker.rollback();
      await transaction?.rollback();
    }
  });

  it("reserves independent cleanup and finalization lanes under queue saturation", async () => {
    const driver = create(1);
    const { scope, claim } = await prepared(driver);
    const transaction = await driver.transaction();
    const queued = driver.execute({ sql: "SELECT 42 AS answer" });
    try {
      const release = driver.binary({ action: "releaseClaim", claim });
      const revoked = scope.close();
      const commit = transaction.commit();
      const closed = driver.close();
      await Promise.all([release, revoked, commit, closed]);
      expect((await queued).rows[0]?.["answer"]).toBe(42);
    } finally {
      await transaction.rollback();
    }
  });

  it("counts repeated resident arguments against the native bind budget", async () => {
    const driver = create();
    const scope = await driver.openBinaryScope();
    const size = 1024 * 1024;
    const capability = await scope.begin({
      reservationBytes: size,
      expectedSize: size,
    });
    const chunk = new Uint8Array(STAGE_CHUNK_BYTES);
    for (let offset = 0; offset < size; offset += chunk.byteLength)
      await scope.append(capability, offset, chunk);
    await scope.seal(capability);
    const claim = await scope.reserve(capability);
    const transaction = await driver.transaction("write", [claim]);
    try {
      await assert.rejects(
        transaction.executeBound({
          sql: "SELECT 1",
          args: Array.from({ length: 101 }, () => ({
            kind: "resident",
            claim,
          })),
        }),
        /bind budget/,
      );
    } finally {
      await transaction.rollback();
    }
    expect((await driver.stageStats()).reservedBytes).toBe(0);
  });

  it("rolls back a resident insert after an ordinary Drizzle SQL failure", async () => {
    const driver = create();
    await driver.execute({
      sql: "CREATE TABLE failures (id INTEGER PRIMARY KEY, bytes BLOB NOT NULL)",
    });
    const { claim } = await prepared(driver);
    await assert.rejects(
      withBinaryTransaction(driver, [claim], async (context) => {
        await context.executeBound(
          context.db
            .insert(failures)
            .values({ id: 1, bytes: sql`${sql.placeholder("payload")}` }),
          new Map([["payload", claim]]),
        );
        await context.db
          .insert(failures)
          .values({ id: 1, bytes: sql`zeroblob(1)` });
      }),
      /Failed query|CONSTRAINT|UNIQUE/i,
    );
    expect(
      (await driver.execute({ sql: "SELECT count(*) AS count FROM failures" }))
        .rows[0]?.["count"],
    ).toBe(0);
    expect((await driver.stageStats()).reservedBytes).toBe(0);
  });

  it("rejects missing/unused binding maps and escaped transaction contexts", async () => {
    const driver = create();
    await driver.execute({
      sql: "CREATE TABLE failures (id INTEGER PRIMARY KEY, bytes BLOB NOT NULL)",
    });
    for (const missing of [true, false]) {
      const { claim } = await prepared(driver);
      await assert.rejects(
        withBinaryTransaction(driver, [claim], async (context) => {
          await context.executeBound(
            context.db
              .insert(failures)
              .values({ id: 1, bytes: sql`${sql.placeholder("payload")}` }),
            missing
              ? new Map()
              : new Map([
                  ["payload", claim],
                  ["extra", claim],
                ]),
          );
        }),
        /placeholder binding/,
      );
    }
    const { claim } = await prepared(driver);
    const escaped = await withBinaryTransaction(
      driver,
      [claim],
      async (context) => context,
    );
    await assert.rejects(
      escaped.executeBound(
        escaped.db
          .insert(failures)
          .values({ id: 1, bytes: sql`${sql.placeholder("payload")}` }),
        new Map([["payload", claim]]),
      ),
      /closed/,
    );
    await assert.rejects(
      async () => escaped.db.select().from(failures),
      /Failed query|closed/i,
    );
    expect((await driver.stageStats()).reservedBytes).toBe(0);
  });
});
