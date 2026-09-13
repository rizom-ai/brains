import assert from "node:assert/strict";
import { constants } from "node:fs";
import { copyFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { TursoThreadProof, type ProofTransaction } from "./client";
import { ProofBudgetPool } from "./budget-pool";
import { STAGE_BUDGET_BYTES } from "./binary-protocol";
import type { BlobPlan } from "../../../src/turso-worker/blob-protocol";

const plan: BlobPlan = {
  table: "budget_rows",
  column: "bytes",
  key: [{ column: "id", value: "seed" }],
  maxBytes: 3,
  expectedSize: 3,
};
const digest =
  "709e80c88487a2411e1ee4dfb9f22a861492d20c4765150c0c794abd70f8147c";

/** Five disposable file databases, not runtime factories or canonical startup. */
export async function exerciseSharedBudget(
  baseUrl: string,
  workerUrl: URL,
): Promise<void> {
  const pool = new ProofBudgetPool();
  const urls = Array.from(
    { length: 5 },
    (_, index) =>
      pathToFileURL(`${fileURLToPath(baseUrl)}.budget-${index}.db`).href,
  );
  const drivers: TursoThreadProof[] = [];
  const leases: ProofTransaction[] = [];
  const errors: unknown[] = [];
  try {
    for (const [index, url] of urls.entries())
      drivers.push(
        new TursoThreadProof({
          url,
          workerUrl,
          budget: pool,
          maxInFlight: index === 3 ? 1 : 16,
        }),
      );
    const [a, b, c, d, e] = drivers;
    assert(a && b && c && d && e);
    const placements = await Promise.all(
      drivers.map((driver) => driver.initialize()),
    );
    assert.equal(new Set(placements.map((value) => value.threadId)).size, 5);
    assert(placements.every((value) => value.pid === process.pid));
    assert.equal(pool.stats().members, 5);
    assert.throws(
      () =>
        new TursoThreadProof({
          url: `${baseUrl}.sixth`,
          workerUrl,
          budget: pool,
        }),
      /member capacity/,
    );
    assert.equal(
      await Bun.file(fileURLToPath(`${baseUrl}.sixth`)).exists(),
      false,
    );
    await Promise.all(
      drivers.map(async (driver, index) => {
        await driver.executeMultiple(
          "CREATE TABLE budget_rows (id TEXT PRIMARY KEY, bytes BLOB); INSERT INTO budget_rows VALUES ('seed', zeroblob(3));",
        );
        await driver.execute({
          sql: "INSERT INTO budget_rows (id) VALUES (?)",
          args: [`database-${index}`],
        });
      }),
    );
    const scopes = await Promise.all(
      drivers.map((driver) => driver.openBinaryScope()),
    );
    const claims = await Promise.all(
      scopes.map(async (scope, index) => {
        const stage = await scope.begin({
          reservationBytes: STAGE_BUDGET_BYTES / 5,
          expectedSize: 3,
        });
        await scope.append(stage, 0, new Uint8Array([index, 0, 0]));
        await scope.seal(stage);
        const claim = await scope.reserve(stage);
        await scope.close();
        return claim;
      }),
    );
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
    assert.equal(pool.stats().residentSlots, 5);
    const spare = await e.openBinaryScope();
    await assert.rejects(
      spare.begin({ reservationBytes: 1 }),
      /shared owner budget/,
    );
    const [ca, cb, cc, cd] = claims;
    assert(ca && cb && cc && cd);
    await assert.rejects(
      b.transaction("write", [ca]),
      /Foreign binary capability/,
    );
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
    const first = await a.transaction("write", [ca]);
    leases.push(first);
    await first.executeBound({
      sql: "INSERT INTO budget_rows VALUES ('resident', ?)",
      args: [{ kind: "resident", claim: ca }],
    });
    const nested = await first.savepoint();
    await first.execute({
      sql: "DELETE FROM budget_rows WHERE id = 'resident'",
    });
    await first.finishSavepoint(nested, "rollback");
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
    assert.equal(
      (
        await first.verifyBlob({
          ...plan,
          key: [{ column: "id", value: "resident" }],
        })
      ).sha256,
      digest,
    );
    const second = await b.transaction("write", [cb]);
    leases.push(second);
    const third = await c.transaction("write", [cc]);
    leases.push(third);
    const readB = b.verifyBlob(plan);
    const readC = c.verifyBlob(plan);
    assert.equal(pool.stats().scratchSlots, 2);
    assert.equal(pool.stats().scratchBytes, 128 * 1024);
    await assert.rejects(e.verifyBlob(plan), /shared owner budget/);
    await assert.rejects(first.verifyBlob(plan), /shared owner budget/);
    const closing = b.close();
    await second.commit();
    assert.equal((await readB).sha256, digest);
    await closing;
    assert.equal(pool.stats().members, 4);
    assert.equal(pool.stats().residentBytes, (STAGE_BUDGET_BYTES * 4) / 5);
    await first.rollback();
    await third.rollback();
    assert.equal((await readC).sha256, digest);
    assert.equal(pool.stats().scratchBytes, 0);
    assert.equal(pool.stats().residentBytes, (STAGE_BUDGET_BYTES * 2) / 5);
    // A saturated ordinary lane cannot prevent cross-worker credit reclamation.
    const fourth = await d.transaction();
    leases.push(fourth);
    const queued = d.execute({ sql: "SELECT 1" });
    await assert.rejects(d.execute({ sql: "SELECT 2" }), /overloaded/);
    await d.binary({ action: "releaseClaim", claim: cd });
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES / 5);
    await fourth.rollback();
    assert.equal((await queued).rows[0]?.[0], 1);
    await e.close(); // Revokes its unadmitted reserved claim, then joins.
    await Promise.all(drivers.map((driver) => driver.close()));
    assert.deepEqual(pool.stats(), {
      members: 0,
      fencedMembers: 0,
      residentBytes: 0,
      residentSlots: 0,
      scratchBytes: 0,
      scratchSlots: 0,
    });
    // Every source is stopped. Restore main files into fresh paths, never in place.
    for (const [index, url] of urls.entries()) {
      const restored = `${url}.restored`;
      await copyFile(
        fileURLToPath(url),
        fileURLToPath(restored),
        constants.COPYFILE_EXCL,
      );
      const driver = new TursoThreadProof({
        url: restored,
        workerUrl,
        budget: pool,
      });
      drivers.push(driver);
      assert.equal((await driver.verifyBlob(plan)).sha256, digest);
      assert.equal(
        (await driver.execute({ sql: "SELECT count(*) FROM budget_rows" }))
          .rows[0]?.[0],
        2,
      );
      assert.equal(
        (
          await driver.execute({
            sql: "SELECT id FROM budget_rows WHERE id != 'seed'",
          })
        ).rows[0]?.[0],
        `database-${index}`,
      );
    }
    assert.equal(pool.stats().members, 5);
  } catch (error) {
    errors.push(error);
  }
  for (const lease of leases) {
    try {
      await lease.rollback();
    } catch (error) {
      errors.push(error);
    }
  }
  for (const driver of drivers) {
    try {
      await driver.close();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length)
    throw new AggregateError(errors, "Shared budget proof or cleanup failed", {
      cause: errors[0],
    });
  assert.deepEqual(pool.stats(), {
    members: 0,
    fencedMembers: 0,
    residentBytes: 0,
    residentSlots: 0,
    scratchBytes: 0,
    scratchSlots: 0,
  });
}
