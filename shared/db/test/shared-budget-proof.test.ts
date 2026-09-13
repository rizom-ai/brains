import { afterEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Worker } from "node:worker_threads";
import {
  PersistenceBudgetPool,
  type BudgetMember,
} from "../src/turso-worker/budget-pool";
import {
  validateBudgetGrant,
  type BudgetGrant,
  type BudgetKind,
} from "../src/turso-worker/budget-protocol";
import {
  SqlWorkerDriver,
  type SqlWorkerDriverOptions,
} from "../src/turso-worker/client";
import {
  STAGE_BUDGET_BYTES,
  type StageCapability,
} from "../src/turso-worker/binary-protocol";
import { VERIFY_SCRATCH_BYTES } from "../src/turso-worker/blob-protocol";
import type { BinaryScope } from "../src/turso-worker/binary-client";

const workerUrl = new URL("../src/turso-worker/worker.ts", import.meta.url);
const drivers: SqlWorkerDriver[] = [];
const failed = new Set<SqlWorkerDriver>();
function create(
  pool: PersistenceBudgetPool,
  options: Partial<SqlWorkerDriverOptions> = {},
): SqlWorkerDriver {
  const driver = new SqlWorkerDriver({
    url: "file::memory:",
    workerUrl,
    ...options,
    budget: pool,
  });
  drivers.push(driver);
  return driver;
}
afterEach(async () => {
  for (const driver of drivers.splice(0)) {
    if (failed.has(driver)) await assert.rejects(driver.close());
    else await driver.close();
  }
  failed.clear();
});
class ObservedPool extends PersistenceBudgetPool {
  public readonly membersSeen: BudgetMember[] = [];
  public readonly workersSeen: Worker[] = [];
  public readonly releases: { id: number; kind: BudgetKind }[] = [];
  public override admit(): BudgetMember {
    const member = super.admit();
    this.membersSeen.push(member);
    return {
      ...member,
      bind: (worker): void => {
        member.bind(worker);
        this.workersSeen.push(worker);
      },
      release: (id, kind): void => {
        this.releases.push({ id, kind });
        member.release(id, kind);
      },
    };
  }
}

describe("shared persistence worker resource pool", () => {
  it("bounds resident slots across five workers even for zero-byte allocations", async () => {
    const pool = new PersistenceBudgetPool();
    const group = Array.from({ length: 5 }, () => create(pool));
    const scopes = await Promise.all(
      group.map((driver) => driver.openBinaryScope()),
    );
    const stages: { scope: BinaryScope; stage: StageCapability }[] = [];
    for (let index = 0; index < 16; index++) {
      const scope = scopes[index % 5];
      assert(scope);
      stages.push({ scope, stage: await scope.begin({ reservationBytes: 0 }) });
    }
    assert.equal(pool.stats().residentBytes, 0);
    assert.equal(pool.stats().residentSlots, 16);
    const scope = scopes[4];
    assert(scope);
    await assert.rejects(
      scope.begin({ reservationBytes: 0 }),
      /shared owner budget/,
    );
    const first = stages[0];
    assert(first);
    await first.scope.discard(first.stage);
    await scope.begin({ reservationBytes: 0 });
    assert.equal(pool.stats().residentSlots, 16);
    await Promise.all(scopes.map((scope) => scope.close()));
    assert.equal(pool.stats().residentSlots, 0);
  });
  it("reserves before worker dispatch and denies the other worker without a waiting queue", async () => {
    const pool = new PersistenceBudgetPool();
    const a = create(pool);
    const b = create(pool);
    const scopeA = await a.openBinaryScope();
    const scopeB = await b.openBinaryScope();
    const gate = new SharedArrayBuffer(4);
    const held = a.holdThreadForProof(gate);
    await held.entered;
    const stage = scopeA.begin({ reservationBytes: STAGE_BUDGET_BYTES });
    try {
      assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
      await assert.rejects(
        scopeB.begin({ reservationBytes: 1 }),
        /shared owner budget/,
      );
      assert.equal(Atomics.load(new Int32Array(gate), 0), 0);
    } finally {
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      await held.done;
    }
    await scopeA.discard(await stage);
    assert.equal(pool.stats().residentBytes, 0);
    await scopeB.begin({ reservationBytes: STAGE_BUDGET_BYTES });
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
  });
  it("releases failed allocations and malformed stages without stealing another member's credit", async () => {
    const pool = new PersistenceBudgetPool();
    const a = create(pool);
    const b = create(pool);
    const scopeA = await a.openBinaryScope();
    const scopeB = await b.openBinaryScope();
    const survivor = await scopeB.begin({ reservationBytes: 7 });
    await assert.rejects(
      scopeA.begin({ reservationBytes: 3, expectedSize: 4 }),
      /Expected size/,
    );
    assert.equal(pool.stats().residentBytes, 7);
    const broken = await scopeA.begin({ reservationBytes: 3 });
    await assert.rejects(scopeB.discard(broken), /Foreign/);
    assert.equal(pool.stats().residentBytes, 10);
    await assert.rejects(
      scopeA.append(broken, 1, new Uint8Array([1])),
      /chunk order/,
    );
    assert.equal(pool.stats().residentBytes, 7);
    await scopeB.discard(survivor);
    assert.equal(pool.stats().residentBytes, 0);
    // Close can race an admitted begin: release notifications need not reference
    // a currently pending RPC, and a successful begin need not retain live credit.
    const pending = scopeA.begin({ reservationBytes: 3 });
    const closing = scopeA.close();
    await pending;
    await closing;
    assert.equal(pool.stats().residentSlots, 0);
  });
  it("does not reclaim a fenced member's resident or scratch grants before actual exit", async () => {
    const pool = new ObservedPool();
    const driver = create(pool);
    const scope = await driver.openBinaryScope();
    const stage = await scope.begin({ reservationBytes: STAGE_BUDGET_BYTES });
    await scope.seal(stage);
    const claim = await scope.reserve(stage);
    await scope.close();
    await driver.transaction("write", [claim]);
    const verifying = assert.rejects(
      driver.verifyBlob({
        table: "not_entered",
        column: "bytes",
        key: [{ column: "id", value: 1 }],
        maxBytes: 1,
      }),
      /owner lost/i,
    );
    const member = pool.membersSeen[0];
    assert(member);
    member.fence();
    assert.equal(pool.stats().fencedMembers, 1);
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
    assert.equal(pool.stats().scratchBytes, VERIFY_SCRATCH_BYTES);
    assert.throws(() => member.cancelUnstarted(), /before exit/);
    failed.add(driver);
    const termination = driver.terminateForProof();
    // Synchronous controller state, before processing any exit event; no delay or
    // assumption about how long termination itself takes.
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
    await termination;
    await verifying;
    await assert.rejects(driver.close());
    assert.equal(pool.stats().members, 0);
    assert.equal(pool.stats().residentBytes, 0);
    assert.equal(pool.stats().scratchBytes, 0);
    assert.throws(
      () => member.reserve(999, { kind: "resident", bytes: 1 }),
      /not live/,
    );
    const replacement = create(pool);
    const replacementScope = await replacement.openBinaryScope();
    await replacementScope.begin({ reservationBytes: STAGE_BUDGET_BYTES });
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
  });
  it("never publishes release credit after uncertain native finalization", async () => {
    const pool = new ObservedPool();
    const driver = create(pool);
    await driver.executeMultiple(
      "PRAGMA foreign_keys = ON; CREATE TABLE parents(id INTEGER PRIMARY KEY); CREATE TABLE children(id INTEGER PRIMARY KEY, parent INTEGER REFERENCES parents(id) DEFERRABLE INITIALLY DEFERRED, bytes BLOB);",
    );
    const scope = await driver.openBinaryScope();
    const stage = await scope.begin({
      reservationBytes: STAGE_BUDGET_BYTES,
      expectedSize: 3,
    });
    await scope.append(stage, 0, new Uint8Array(3));
    await scope.seal(stage);
    const claim = await scope.reserve(stage);
    await scope.close();
    const lease = await driver.transaction("write", [claim]);
    await lease.executeBound({
      sql: "INSERT INTO children VALUES (1, 99, ?)",
      args: [{ kind: "resident", claim }],
    });
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
    failed.add(driver);
    await assert.rejects(lease.commit(), /owner lost/i);
    await assert.rejects(driver.close(), /owner lost/i);
    assert.deepEqual(pool.releases, []);
    assert.equal(pool.stats().members, 0);
    assert.equal(pool.stats().residentBytes, 0);
  });
  it("reclaims startup reservations only on exit and prevents reuse of a bound member", async () => {
    const pool = new ObservedPool();
    const driver = create(pool, {
      workerUrl: new URL(
        "./fixtures/missing-budget-worker.ts",
        import.meta.url,
      ),
    });
    failed.add(driver);
    const pending = driver.binary({
      action: "beginStage",
      scope: randomUUID(),
      reservationBytes: STAGE_BUDGET_BYTES,
    });
    assert.equal(pool.stats().residentBytes, STAGE_BUDGET_BYTES);
    await assert.rejects(pending);
    await assert.rejects(driver.close());
    assert.equal(pool.stats().residentBytes, 0);
    const member = pool.membersSeen[0];
    assert(member);
    assert.throws(() => member.cancelUnstarted(), /before exit/);
    const unstarted = pool.admit();
    unstarted.cancelUnstarted();
    assert.throws(
      () => unstarted.reserve(1, { kind: "resident", bytes: 1 }),
      /not live/,
    );
    assert.equal(pool.stats().members, 0);
  });
  it("preserves owner and termination failures while withholding unconfirmed exit credit", async () => {
    const pool = new ObservedPool();
    const driver = create(pool);
    const scope = await driver.openBinaryScope();
    const stage = await scope.begin({ reservationBytes: 3 });
    const member = pool.membersSeen[0];
    const worker = pool.workersSeen[0];
    assert(member && worker);
    const terminate = worker.terminate.bind(worker);
    const terminationError = new Error("Controlled termination failure");
    worker.terminate = async (): Promise<number> => {
      throw terminationError;
    };
    failed.add(driver);
    try {
      member.fence();
      let lost: unknown;
      await assert.rejects(scope.discard(stage), (error) => {
        assert(error instanceof Error);
        assert.equal(error.name, "PersistenceOwnerLostError");
        lost = error;
        return true;
      });
      await assert.rejects(driver.close(), (error) => {
        assert(error instanceof AggregateError);
        assert.deepEqual(error.errors, [lost, terminationError]);
        assert.equal(error.cause, terminationError);
        return true;
      });
      assert.equal(pool.stats().residentBytes, 3);
      assert.equal(pool.stats().fencedMembers, 1);
    } finally {
      worker.terminate = terminate;
      await terminate();
    }
    assert.equal(pool.stats().members, 0);
    assert.equal(pool.stats().residentBytes, 0);
  });
  it("validates grant identity, kind and exact charge before native admission", () => {
    const pool = randomUUID();
    const command = {
      op: "binary",
      command: {
        action: "beginStage",
        scope: randomUUID(),
        reservationBytes: 3,
      },
    } as const;
    const grant: BudgetGrant = { pool, id: 7, kind: "resident", bytes: 3 };
    validateBudgetGrant(command, grant, pool, 7);
    assert.throws(() => validateBudgetGrant(command, undefined, pool, 7));
    for (const forged of [
      { ...grant, pool: randomUUID() },
      { ...grant, id: 8 },
      { ...grant, kind: "scratch" as const },
      { ...grant, bytes: 2 },
    ])
      assert.throws(
        () => validateBudgetGrant(command, forged, pool, 7),
        /mismatched/,
      );
    assert.throws(
      () => validateBudgetGrant({ op: "close" }, grant, pool, 7),
      /Unexpected/,
    );
    expect(grant.bytes).toBe(3);
  });
  it("rejects foreign, duplicate and wrong-kind releases without consuming rightful grants", async () => {
    const pool = new ObservedPool();
    const a = create(pool);
    const b = create(pool);
    await Promise.all([a.initialize(), b.initialize()]);
    const [first, second] = pool.membersSeen;
    assert(first && second);
    const grant = first.reserve(1000, { kind: "resident", bytes: 3 });
    grant.bytes = 0; // A returned metadata object does not own ledger accounting.
    assert.equal(pool.stats().residentBytes, 3);
    assert.throws(() => second.release(1000, "resident"), /Unknown/);
    assert.throws(() => first.release(1000, "scratch"), /mismatched/);
    assert.throws(
      () => first.reserve(1000, { kind: "resident", bytes: 3 }),
      /Reused/,
    );
    assert.equal(pool.stats().residentBytes, 3);
    first.release(1000, "resident");
    assert.throws(() => first.release(1000, "resident"), /Unknown/);
    assert.equal(pool.stats().residentBytes, 0);
  });
});
