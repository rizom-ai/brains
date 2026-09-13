import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { parseResults } from "../src/turso-worker/result-protocol";
import { randomUUID } from "node:crypto";
import { MigrationPlans } from "../src/turso-worker/migration-plans";
import {
  MigrationPrograms,
  type MigrationSender,
} from "../src/turso-worker/migration-client";
import { SqlWorkerDriver } from "../src/turso-worker/client";
import {
  MAX_MIGRATION_BYTES,
  MAX_MIGRATION_PLANS,
  MAX_MIGRATION_STATEMENTS,
  migrationTokenSchema,
  statementBytes,
  type MigrationCommand,
  type SqlStatement,
} from "../src/turso-worker/protocol";

const workerUrl = new URL("../src/turso-worker/worker.ts", import.meta.url);
const sql: SqlStatement = { sql: "SELECT 1" };
const bytes = statementBytes(sql);
const notRun = async (): Promise<never> => {
  throw new Error("Native execution must not occur");
};

function setup(): {
  plans: MigrationPlans;
  reserve: (
    count?: number,
    size?: number,
  ) => Promise<ReturnType<typeof migrationTokenSchema.parse>>;
} {
  const plans = new MigrationPlans(randomUUID());
  let id = 0;
  return {
    plans,
    reserve: async (count = 1, size = bytes) =>
      migrationTokenSchema.parse(
        await plans.execute(
          { action: "reserve", count, bytes: size },
          ++id,
          notRun,
        ),
      ),
  };
}

describe("bounded worker migration programs", () => {
  it("reserves whole-plan bytes and slots before receiving metadata", async () => {
    const { plans, reserve } = setup();
    const full = await reserve(1, MAX_MIGRATION_BYTES);
    await assert.rejects(reserve(), /capacity/);
    await plans.execute({ action: "discard", token: full }, 0, notRun);
    for (let i = 0; i < MAX_MIGRATION_PLANS; i++) await reserve(0, 0);
    await assert.rejects(reserve(0, 0), /capacity/);
    plans.closeAdmission();
    assert.deepEqual(plans.stats(), { bytes: 0, plans: 0 });
    await assert.rejects(reserve(), /closed/);
  });

  it("rejects foreign generations without consuming rightful plans and rejects spent identities", async () => {
    const { plans, reserve } = setup();
    const token = await reserve();
    await assert.rejects(
      plans.execute(
        { action: "discard", token: { ...token, generation: randomUUID() } },
        0,
        notRun,
      ),
      /Foreign/,
    );
    assert.equal(plans.stats().bytes, bytes);
    await plans.execute({ action: "discard", token }, 0, notRun);
    await assert.rejects(
      plans.execute({ action: "run", token, count: 1 }, 0, notRun),
      /spent/,
    );
    await assert.rejects(
      plans.execute({ action: "reserve", bytes, count: 1 }, token.id, notRun),
      /identity/,
    );
  });

  it("discards incomplete, out-of-order, over-budget and control-bearing plans before native entry", async () => {
    for (const failure of ["incomplete", "offset", "bytes", "control"]) {
      const { plans, reserve } = setup();
      const token = await reserve(1, failure === "bytes" ? bytes - 1 : bytes);
      const command: MigrationCommand =
        failure === "incomplete"
          ? { action: "run", token, count: 1 }
          : {
              action: "append",
              token,
              offset: failure === "offset" ? 1 : 0,
              statements: [failure === "control" ? { sql: "COMMIT" } : sql],
            };
      await assert.rejects(plans.execute(command, 0, notRun));
      assert.deepEqual(plans.stats(), { bytes: 0, plans: 0 });
    }
  });

  it("retains a running plan through close and rejects replay or discard until its outcome", async () => {
    const { plans, reserve } = setup();
    const token = await reserve();
    await reserve(); // An incomplete, unrelated plan is revoked at close.
    await plans.execute(
      { action: "append", token, offset: 0, statements: [sql] },
      0,
      notRun,
    );
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const running = plans.execute(
      { action: "run", token, count: 1 },
      0,
      async (statements) => {
        assert.deepEqual(statements, [sql]);
        entered.resolve();
        await release.promise;
        return 42;
      },
    );
    await entered.promise;
    try {
      plans.closeAdmission();
      assert.deepEqual(plans.stats(), { bytes, plans: 1 });
      await assert.rejects(
        plans.execute({ action: "run", token, count: 1 }, 0, notRun),
        /running/,
      );
      await assert.rejects(
        plans.execute({ action: "discard", token }, 0, notRun),
        /running/,
      );
    } finally {
      release.resolve();
    }
    assert.equal(await running, 42);
    assert.deepEqual(plans.stats(), { bytes: 0, plans: 0 });
  });

  it("releases a failed native plan and preserves its exact failure", async () => {
    const { plans, reserve } = setup();
    const token = await reserve();
    await plans.execute(
      { action: "append", token, offset: 0, statements: [sql] },
      0,
      notRun,
    );
    const failure = new Error("native migration failed");
    await assert.rejects(
      plans.execute({ action: "run", token, count: 1 }, 0, async () => {
        throw failure;
      }),
      (error: unknown) => error === failure,
    );
    assert.deepEqual(plans.stats(), { bytes: 0, plans: 0 });
  });

  it("bounds sender reservations before upload and releases them after failed admission", async () => {
    const gate = Promise.withResolvers<unknown>();
    const failure = new Error("reserve refused");
    const sender: MigrationSender = {
      closed: false,
      migration: () => gate.promise,
    };
    const programs = new MigrationPrograms(sender);
    const large = Array.from({ length: 4 }, () => ({
      sql: `SELECT 1 /* ${"x".repeat(60 * 1024)} */`,
    }));
    const first = programs.execute(large);
    const rejected = assert.rejects(
      first,
      (error: unknown) => error === failure,
    );
    try {
      await assert.rejects(programs.execute(large), /capacity/);
      await assert.rejects(
        programs.execute(
          Array.from({ length: MAX_MIGRATION_STATEMENTS + 1 }, () => sql),
        ),
        /statement limit/,
      );
    } finally {
      gate.reject(failure);
    }
    await rejected;
    await assert.rejects(
      programs.execute(large),
      (error: unknown) => error === failure,
    );
  });

  it("preserves upload and cleanup failures together", async () => {
    const primary = new Error("upload rejected");
    const cleanup = new Error("discard rejected");
    const sender: MigrationSender = {
      closed: false,
      migration: async (command) => {
        if (command.action === "reserve")
          return { generation: randomUUID(), id: 1 };
        if (command.action === "discard") throw cleanup;
        throw primary;
      },
    };
    await assert.rejects(
      new MigrationPrograms(sender).execute([sql]),
      (error: unknown) => {
        assert.ok(error instanceof AggregateError);
        assert.deepEqual(error.errors, [primary, cleanup]);
        return true;
      },
    );
  });

  it("uses independent cleanup capacity while ordinary native work is saturated", async () => {
    const driver = new SqlWorkerDriver({
      url: "file::memory:",
      workerUrl,
      maxInFlight: 2,
    });
    try {
      const token = migrationTokenSchema.parse(
        await driver.migration({ action: "reserve", bytes, count: 1 }),
      );
      const lease = await driver.transaction();
      const pending = [driver.execute(sql), driver.execute(sql)];
      try {
        await assert.rejects(driver.execute(sql), /overloaded/);
        await driver.migration({ action: "discard", token });
      } finally {
        await lease.rollback();
        await Promise.all(pending);
      }
    } finally {
      await driver.close();
    }
  });

  it("fences queued work when an admitted program loses its native transaction", async () => {
    const driver = new SqlWorkerDriver({ url: "file::memory:", workerUrl });
    await driver.execute({
      sql: "CREATE TABLE records (id INTEGER PRIMARY KEY)",
    });
    await driver.execute({ sql: "INSERT INTO records VALUES (1)" });
    const statements = [
      { sql: "INSERT INTO records VALUES (2)" },
      { sql: "INSERT OR ROLLBACK INTO records VALUES (1)" },
    ];
    const token = migrationTokenSchema.parse(
      await driver.migration({
        action: "reserve",
        bytes: statements.reduce(
          (sum, statement) => sum + statementBytes(statement),
          0,
        ),
        count: statements.length,
      }),
    );
    await driver.migration({ action: "append", token, offset: 0, statements });
    const run = driver.migration({
      action: "run",
      token,
      count: statements.length,
    });
    const queued = driver.execute({ sql: "INSERT INTO records VALUES (3)" });
    const closing = driver.close();
    const settled = await Promise.allSettled([run, queued, closing]);
    for (const result of settled) {
      assert.equal(result.status, "rejected");
      assert.equal(result.reason.name, "PersistenceOwnerLostError");
    }
    await assert.rejects(driver.close(), /owner lost/i);
  });

  it("drains an admitted complete program during shutdown without revoking its reservation", async () => {
    const driver = new SqlWorkerDriver({ url: "file::memory:", workerUrl });
    try {
      const token = migrationTokenSchema.parse(
        await driver.migration({ action: "reserve", bytes, count: 1 }),
      );
      await driver.migration({
        action: "append",
        token,
        offset: 0,
        statements: [sql],
      });
      const lease = await driver.transaction();
      const result = driver.migration({ action: "run", token, count: 1 });
      const closing = driver.close();
      await lease.rollback();
      expect(parseResults(await result).map((entry) => entry.rows)).toEqual([
        [[1]],
      ]);
      await closing;
      expect(driver.closed).toBe(true);
    } finally {
      await driver.close();
    }
  });
});
