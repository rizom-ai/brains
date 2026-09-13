import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { withNativeStatement } from "../src/turso-worker/native-statement";
import type { ResultSet, Transaction } from "@libsql/client";
import {
  ExecutionOwner,
  OwnerUncertainError,
} from "../src/turso-worker/ownership";
import type {
  OwnerBackend,
  NativeTransaction,
} from "../src/turso-worker/backend-contract";

interface Hooks {
  begin?: () => Promise<void>;
  statement?: () => Promise<void>;
  batch?: () => Promise<void>;
  commit?: () => Promise<void>;
  rollback?: () => Promise<void>;
  setForeignKeys?: (enabled: boolean) => Promise<void>;
  readForeignKeys?: (actual: boolean) => Promise<boolean>;
  close?: () => Promise<void>;
  readTransactionState?: (actual: boolean) => boolean;
  savepoint?: NativeTransaction["savepoint"];
}
const empty: ResultSet = {
  columns: [],
  columnTypes: [],
  rows: [],
  rowsAffected: 0,
  lastInsertRowid: undefined,
  toJSON: () => ({}),
};
function fixture(hooks: Hooks = {}): {
  owner: ExecutionOwner;
  events: string[];
  nativeState: { inTransaction: boolean };
} {
  const events: string[] = [];
  const nativeState = { inTransaction: false };
  let foreignKeys = true;
  const backend: OwnerBackend = {
    inTransaction: () =>
      hooks.readTransactionState
        ? hooks.readTransactionState(nativeState.inTransaction)
        : nativeState.inTransaction,
    execute: async () => {
      events.push("execute");
      return empty;
    },
    executeMultiple: async () => {
      events.push("script");
    },
    transaction: async () => {
      events.push("begin");
      await hooks.begin?.();
      nativeState.inTransaction = true;
      const transaction: Transaction & Pick<NativeTransaction, "savepoint"> = {
        closed: false,
        execute: async () => {
          events.push("lease-execute");
          await hooks.statement?.();
          return empty;
        },
        batch: async () => {
          events.push("lease-batch");
          await hooks.batch?.();
          return [empty];
        },
        executeMultiple: async () => {
          events.push("lease-script");
        },
        savepoint: async (action, id) => {
          events.push(`savepoint:${action}:${id}`);
          await hooks.savepoint?.(action, id);
        },
        commit: async () => {
          events.push("commit");
          await hooks.commit?.();
          nativeState.inTransaction = false;
          transaction.closed = true;
        },
        rollback: async () => {
          events.push("rollback");
          await hooks.rollback?.();
          nativeState.inTransaction = false;
          transaction.closed = true;
        },
        close: () => {
          throw new Error("Controller must use observable finalization");
        },
      };
      return transaction;
    },
    setForeignKeys: async (enabled) => {
      events.push(enabled ? "fk-on" : "fk-off");
      await hooks.setForeignKeys?.(enabled);
      foreignKeys = enabled;
    },
    foreignKeysEnabled: async () => {
      events.push("fk-read");
      return hooks.readForeignKeys
        ? hooks.readForeignKeys(foreignKeys)
        : foreignKeys;
    },
    close: async () => {
      events.push("close");
      await hooks.close?.();
    },
  };
  return { owner: new ExecutionOwner(backend), events, nativeState };
}
function gate(): {
  entered: ReturnType<typeof Promise.withResolvers<void>>;
  release: ReturnType<typeof Promise.withResolvers<void>>;
} {
  return {
    entered: Promise.withResolvers<void>(),
    release: Promise.withResolvers<void>(),
  };
}

describe("fail-closed execution ownership", () => {
  it("fences queued native work when statement cleanup fails with transaction state still valid", async () => {
    const { owner, events, nativeState } = fixture({
      statement: async () =>
        withNativeStatement(
          () => true,
          async () => ({
            close: (): void => {
              throw new Error("finalization failed");
            },
          }),
          async () => undefined,
        ),
    });
    const lease = await owner.transaction("write");
    const result = assert.rejects(
      lease.execute("SELECT 1"),
      /cannot be reused/,
    );
    const queued = assert.rejects(
      owner.execute("SELECT 2"),
      /cannot be reused/,
    );
    await result;
    expect(nativeState.inTransaction).toBe(true);
    expect(owner.failed).toBe(true);
    await assert.rejects(lease.rollback(), /cannot be reused/);
    await queued;
    await assert.rejects(owner.close(), /cannot be reused/);
    expect(events).toEqual(["begin", "lease-execute"]);
  });
  for (const action of ["commit", "rollback"] as const) {
    it(`blocks every queued native entry after failed ${action}, even if the native slot was released`, async () => {
      const blocked = gate();
      const cause = new Error(`${action} failed`);
      let nativeSlotReleased = false;
      const { owner, events } = fixture({
        [action]: async () => {
          blocked.entered.resolve();
          await blocked.release.promise;
          // Model the existing adapter releasing its slot before rejection reaches
          // its caller. There is no SQL-string interception or timing assumption.
          nativeSlotReleased = true;
          throw cause;
        },
      });
      const lease = await owner.transaction("write");
      const rejected = [
        assert.rejects(owner.execute("SELECT 1"), OwnerUncertainError),
        assert.rejects(
          owner.batch(["SELECT 1"], "deferred"),
          OwnerUncertainError,
        ),
        assert.rejects(owner.migrate(["SELECT 1"]), OwnerUncertainError),
        assert.rejects(owner.executeMultiple("SELECT 1"), OwnerUncertainError),
        assert.rejects(owner.transaction("write"), OwnerUncertainError),
        assert.rejects(owner.close(), OwnerUncertainError),
      ];
      const finish = lease[action]();
      rejected.push(
        assert.rejects(finish, (error: unknown) => {
          assert.ok(error instanceof OwnerUncertainError);
          assert.equal(error.cause, cause);
          return true;
        }),
      );
      try {
        await blocked.entered.promise;
        expect(events).toEqual(["begin", action]);
      } finally {
        blocked.release.resolve();
      }
      await Promise.all(rejected);
      expect(nativeSlotReleased).toBe(true);
      expect(owner.failed).toBe(true);
      expect(events).toEqual(["begin", action]);
      expect(lease[action]()).toBe(finish);
      await assert.rejects(owner.execute("SELECT 2"), OwnerUncertainError);
      await assert.rejects(lease.execute("SELECT 3"), OwnerUncertainError);
    });
  }

  it("retains both SQL and rollback failures and never resets a poisoned migration", async () => {
    const statementError = new Error("statement failed");
    const rollbackError = new Error("rollback failed");
    const blocked = gate();
    const { owner, events } = fixture({
      batch: async () => {
        throw statementError;
      },
      rollback: async () => {
        blocked.entered.resolve();
        await blocked.release.promise;
        throw rollbackError;
      },
    });
    const migration = assert.rejects(
      owner.migrate(["SELECT 1"]),
      (error: unknown) => {
        assert.ok(error instanceof OwnerUncertainError);
        assert.ok(error.cause instanceof AggregateError);
        assert.deepEqual(error.cause.errors, [statementError, rollbackError]);
        return true;
      },
    );
    await blocked.entered.promise;
    const queued = assert.rejects(
      owner.execute("SELECT 2"),
      OwnerUncertainError,
    );
    blocked.release.resolve();
    await Promise.all([migration, queued]);
    expect(events).toEqual([
      "fk-off",
      "fk-read",
      "begin",
      "lease-batch",
      "rollback",
    ]);
  });

  for (const sqlFails of [false, true]) {
    it(`quarantines failed migration reset after ${sqlFails ? "acknowledged rollback" : "successful commit"}`, async () => {
      const blocked = gate();
      const statementError = new Error("statement failed");
      const resetError = new Error("reset failed");
      const { owner, events } = fixture({
        batch: async () => {
          if (sqlFails) throw statementError;
        },
        setForeignKeys: async (enabled) => {
          if (enabled) {
            blocked.entered.resolve();
            await blocked.release.promise;
            throw resetError;
          }
        },
      });
      const migration = assert.rejects(
        owner.migrate(["SELECT 1"]),
        (error: unknown) => {
          assert.ok(error instanceof OwnerUncertainError);
          if (sqlFails) {
            assert.ok(error.cause instanceof AggregateError);
            assert.deepEqual(error.cause.errors, [statementError, resetError]);
          } else assert.equal(error.cause, resetError);
          return true;
        },
      );
      await blocked.entered.promise;
      const queued = assert.rejects(
        owner.execute("SELECT 2"),
        OwnerUncertainError,
      );
      const closing = assert.rejects(owner.close(), OwnerUncertainError);
      blocked.release.resolve();
      await Promise.all([migration, queued, closing]);
      expect(events).toEqual([
        "fk-off",
        "fk-read",
        "begin",
        "lease-batch",
        sqlFails ? "rollback" : "commit",
        "fk-on",
      ]);
    });
  }

  for (const operation of ["batch", "migrate"] as const) {
    it(`does not retry rollback or run queued work after ${operation} commit rejection`, async () => {
      const blocked = gate();
      const { owner, events } = fixture({
        commit: async () => {
          blocked.entered.resolve();
          await blocked.release.promise;
          throw new Error(
            "commit result unavailable, possibly already committed",
          );
        },
      });
      const operationResult =
        operation === "batch"
          ? owner.batch(["SELECT 1"], "write")
          : owner.migrate(["SELECT 1"]);
      const rejected = assert.rejects(operationResult, OwnerUncertainError);
      await blocked.entered.promise;
      const queued = assert.rejects(
        owner.execute("SELECT 2"),
        OwnerUncertainError,
      );
      blocked.release.resolve();
      await Promise.all([rejected, queued]);
      expect(events).toEqual([
        ...(operation === "migrate" ? ["fk-off", "fk-read"] : []),
        "begin",
        "lease-batch",
        "commit",
      ]);
    });
  }

  it("checks foreign-key state rather than trusting a resolved setter promise", async () => {
    const { owner, events } = fixture({ readForeignKeys: async () => false });
    await assert.rejects(owner.migrate(["SELECT 1"]), OwnerUncertainError);
    await assert.rejects(owner.execute("SELECT 2"), OwnerUncertainError);
    expect(events).toEqual([
      "fk-off",
      "fk-read",
      "begin",
      "lease-batch",
      "commit",
      "fk-on",
      "fk-read",
    ]);
  });

  it("stops on failed disable without beginning a transaction or guessing cleanup", async () => {
    const { owner, events } = fixture({
      setForeignKeys: async () => {
        throw new Error("setting failed");
      },
    });
    await assert.rejects(owner.migrate(["SELECT 1"]), OwnerUncertainError);
    await assert.rejects(owner.close(), OwnerUncertainError);
    expect(events).toEqual(["fk-off"]);
  });

  for (const phase of ["begin", "close"] as const) {
    it(`makes failed ${phase} terminal and observable`, async () => {
      const cause = new Error(`${phase} failed`);
      const { owner, events } = fixture({
        [phase]: async () => {
          throw cause;
        },
      });
      await assert.rejects(
        phase === "begin" ? owner.transaction("write") : owner.close(),
        (error: unknown) => {
          assert.ok(error instanceof OwnerUncertainError);
          assert.equal(error.cause, cause);
          return true;
        },
      );
      await assert.rejects(owner.execute("SELECT 1"), OwnerUncertainError);
      await assert.rejects(owner.close(), OwnerUncertainError);
      expect(events).toEqual([phase]);
    });
  }

  it("keeps SQL errors local after acknowledged rollback and verified reset", async () => {
    const statementError = new Error("statement failed");
    const { owner, events } = fixture({
      batch: async () => {
        throw statementError;
      },
    });
    await assert.rejects(
      owner.batch(["SELECT 1"], "write"),
      (error: unknown) => error === statementError,
    );
    await assert.rejects(
      owner.migrate(["SELECT 1"]),
      (error: unknown) => error === statementError,
    );
    await owner.execute("SELECT 2");
    await owner.close();
    expect(owner.failed).toBe(false);
    expect(events).toEqual([
      "begin",
      "lease-batch",
      "rollback",
      "fk-off",
      "fk-read",
      "begin",
      "lease-batch",
      "rollback",
      "fk-on",
      "fk-read",
      "execute",
      "close",
    ]);
  });

  it("treats failed state observation as terminal before native execution", async () => {
    const { owner, events } = fixture({
      readTransactionState: () => {
        throw new Error("state unavailable");
      },
    });
    await assert.rejects(owner.execute("SELECT 1"), OwnerUncertainError);
    await assert.rejects(owner.close(), OwnerUncertainError);
    expect(events).toEqual([]);
  });

  it("rejects an acknowledged begin that did not establish native transaction state", async () => {
    const { owner, events } = fixture({ readTransactionState: () => false });
    await assert.rejects(owner.transaction("write"), OwnerUncertainError);
    await assert.rejects(owner.execute("SELECT 1"), OwnerUncertainError);
    expect(events).toEqual(["begin"]);
  });

  for (const action of ["commit", "rollback"] as const) {
    it(`checks native state after an acknowledged ${action}`, async () => {
      let keepActive = false;
      const { owner, events } = fixture({
        [action]: async () => {
          keepActive = true;
        },
        readTransactionState: (actual) => actual || keepActive,
      });
      const lease = await owner.transaction("write");
      const queued = assert.rejects(
        owner.execute("SELECT 1"),
        OwnerUncertainError,
      );
      await assert.rejects(lease[action](), OwnerUncertainError);
      await queued;
      expect(events).toEqual(["begin", action]);
    });
  }

  it("fences admitted lease statements after an implicit rollback and preserves the SQL cause", async () => {
    const cause = new Error("statement caused rollback");
    const { owner, events, nativeState } = fixture({
      statement: async () => {
        nativeState.inTransaction = false;
        throw cause;
      },
    });
    const lease = await owner.transaction("write");
    const first = assert.rejects(
      lease.execute("SELECT 1"),
      (error: unknown) => {
        assert.ok(error instanceof OwnerUncertainError);
        assert.ok(error.cause instanceof AggregateError);
        assert.equal(error.cause.errors[0], cause);
        return true;
      },
    );
    const later = assert.rejects(
      lease.execute("SELECT 2"),
      OwnerUncertainError,
    );
    const outside = assert.rejects(
      owner.execute("SELECT 3"),
      OwnerUncertainError,
    );
    await first;
    await assert.rejects(lease.rollback(), OwnerUncertainError);
    await Promise.all([later, outside]);
    expect(events).toEqual(["begin", "lease-execute"]);
  });

  for (const leased of [false, true]) {
    it(`checks state between every statement of a ${leased ? "leased" : "root"} batch`, async () => {
      const { owner, events, nativeState } = fixture({
        batch: async () => {
          nativeState.inTransaction = false;
        },
      });
      if (leased) {
        const lease = await owner.transaction("write");
        await assert.rejects(
          lease.batch(["SELECT 1", "SELECT 2"]),
          OwnerUncertainError,
        );
        await assert.rejects(lease.rollback(), OwnerUncertainError);
      } else
        await assert.rejects(
          owner.batch(["SELECT 1", "SELECT 2"], "write"),
          OwnerUncertainError,
        );
      await assert.rejects(owner.execute("SELECT 3"), OwnerUncertainError);
      expect(events).toEqual(["begin", "lease-batch"]);
    });
  }

  it("does not enter a statement when an existing lease has already lost its native transaction", async () => {
    const { owner, events, nativeState } = fixture();
    const lease = await owner.transaction("write");
    nativeState.inTransaction = false;
    await assert.rejects(lease.execute("SELECT 1"), OwnerUncertainError);
    await assert.rejects(lease.rollback(), OwnerUncertainError);
    expect(events).toEqual(["begin"]);
  });

  for (const phase of [
    "begin",
    "release",
    "rollback",
    "release-after-rollback",
  ] as const) {
    it(`poisons savepoint ${phase} failure before any queued native work`, async () => {
      const cause = new Error(`savepoint ${phase} failed`);
      let rollingBack = false;
      const { owner, events } = fixture({
        savepoint: async (action) => {
          if (action === "rollback") rollingBack = true;
          if (
            action === phase ||
            (phase === "release-after-rollback" &&
              action === "release" &&
              rollingBack)
          )
            throw cause;
        },
      });
      const lease = await owner.transaction("write");
      if (phase !== "begin") await lease.savepoint("begin", 1);
      const queued = assert.rejects(
        owner.execute("SELECT 1"),
        OwnerUncertainError,
      );
      const closing = assert.rejects(owner.close(), OwnerUncertainError);
      await assert.rejects(
        lease.savepoint(
          phase === "release-after-rollback" ? "rollback" : phase,
          1,
        ),
        (error: unknown) => {
          assert.ok(error instanceof OwnerUncertainError);
          assert.equal(error.cause, cause);
          return true;
        },
      );
      await assert.rejects(lease.rollback(), OwnerUncertainError);
      await Promise.all([queued, closing]);
      expect(events).toEqual([
        "begin",
        "savepoint:begin:1",
        ...(phase === "begin"
          ? []
          : phase === "release-after-rollback"
            ? ["savepoint:rollback:1", "savepoint:release:1"]
            : [`savepoint:${phase}:1`]),
      ]);
    });
  }

  it("preflights every SQL group before even disabling foreign keys or beginning a transaction", async () => {
    const { owner, events } = fixture();
    await assert.rejects(owner.execute("BEGIN"), { name: "SqlAdmissionError" });
    await assert.rejects(
      owner.executeMultiple("INSERT INTO t VALUES (1); COMMIT; BEGIN"),
      { name: "SqlAdmissionError" },
    );
    await assert.rejects(
      owner.batch(["INSERT INTO t VALUES (1)", "COMMIT"], "write"),
      { name: "SqlAdmissionError" },
    );
    await assert.rejects(
      owner.migrate(["INSERT INTO t VALUES (1)", "SAVEPOINT sp"]),
      { name: "SqlAdmissionError" },
    );
    expect(events).toEqual([]);
    await owner.close();
  });

  it("drains admitted statements before finish without poisoning the lease on SQL error", async () => {
    const blocked = gate();
    const { owner, events } = fixture({
      statement: async () => {
        blocked.entered.resolve();
        await blocked.release.promise;
        throw new Error("statement failed");
      },
    });
    const lease = await owner.transaction("write");
    const statement = assert.rejects(
      lease.execute("SELECT 1"),
      /statement failed/,
    );
    const finished = lease.rollback();
    const queued = owner.execute("SELECT 2");
    try {
      await blocked.entered.promise;
      expect(events).toEqual(["begin", "lease-execute"]);
      await assert.rejects(lease.execute("SELECT 3"), /closed/);
    } finally {
      blocked.release.resolve();
    }
    await Promise.all([statement, finished, queued]);
    await owner.close();
    expect(events).toEqual([
      "begin",
      "lease-execute",
      "rollback",
      "execute",
      "close",
    ]);
  });
});
