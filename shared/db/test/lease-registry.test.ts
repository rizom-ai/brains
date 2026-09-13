import { it, expect } from "bun:test";
import assert from "node:assert/strict";
import { ExecutionOwner } from "../src/turso-worker/ownership";
import { LeaseRegistry } from "../src/turso-worker/lease-registry";
import type {
  OwnerBackend,
  NativeTransaction,
} from "../src/turso-worker/backend-contract";

it.each(["begin", "commit"] as const)(
  "preserves %s and binding cleanup failures while keeping the owner fenced",
  async (phase) => {
    const primary = new Error("Native operation failed");
    const cleanup = new Error("Binding cleanup failed");
    let active = false;
    let attached = "";
    let cleanupCalls = 0;
    function unexpected(): never {
      throw new Error("Unexpected native operation");
    }
    const transaction: NativeTransaction = {
      execute: unexpected,
      executeMultiple: unexpected,
      batch: unexpected,
      savepoint: unexpected,
      rollback: unexpected,
      commit: async () => {
        throw primary;
      },
    };
    const backend: OwnerBackend = {
      inTransaction: () => active,
      execute: unexpected,
      executeMultiple: unexpected,
      setForeignKeys: unexpected,
      foreignKeysEnabled: unexpected,
      close: unexpected,
      transaction: async () => {
        assert.notEqual(attached, "");
        if (phase === "begin") throw primary;
        active = true;
        return transaction;
      },
    };
    const owner = new ExecutionOwner(backend);
    const registry = new LeaseRegistry<number>(owner, {
      attach: (id, claims): void => {
        assert.deepEqual(claims, [7]);
        attached = id;
      },
      finishLease: (id): void => {
        assert.equal(id, attached);
        cleanupCalls++;
        throw cleanup;
      },
    });
    const operation =
      phase === "begin"
        ? registry.begin("write", [7])
        : registry
            .begin("write", [7])
            .then((id) => registry.finish(id, "commit"));
    let ownerFailure: unknown;
    await assert.rejects(operation, (error) => {
      assert(error instanceof AggregateError);
      assert.equal(error.cause, cleanup);
      assert.equal(error.errors[1], cleanup);
      ownerFailure = error.errors[0];
      assert(ownerFailure instanceof Error);
      assert.equal(ownerFailure.cause, primary);
      return true;
    });
    expect(cleanupCalls).toBe(1);
    assert.equal(owner.failed, true);
    assert.throws(() => registry.get(attached), /Unknown or finished/);
    await assert.rejects(
      owner.execute("SELECT 1"),
      (error) => error === ownerFailure,
    );
  },
);
