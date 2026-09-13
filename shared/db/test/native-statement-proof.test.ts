import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import {
  NativeStatementUncertainError,
  withNativeStatement,
} from "../src/turso-worker/native-statement";

describe("acknowledged native statement lifetime", () => {
  it("does not finish an operation before statement cleanup is acknowledged", async () => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let complete = false;
    const value = withNativeStatement(
      () => true,
      async () => ({
        close: async (): Promise<void> => {
          entered.resolve();
          await release.promise;
        },
      }),
      async () => 42,
    ).then((result) => {
      complete = true;
      return result;
    });
    await entered.promise;
    expect(complete).toBe(false);
    release.resolve();
    expect(await value).toBe(42);
    expect(complete).toBe(true);
  });
  it("refuses execution or cleanup after preparation loses the native transaction", async () => {
    let active = true;
    let uses = 0;
    let closes = 0;
    await assert.rejects(
      withNativeStatement(
        () => active,
        async () => {
          active = false;
          return {
            close: (): void => {
              closes++;
            },
          };
        },
        async () => {
          uses++;
        },
      ),
      NativeStatementUncertainError,
    );
    assert.equal(uses, 0);
    assert.equal(closes, 0);
  });
  it("preserves ordinary query and prepare failures when resource cleanup is known", async () => {
    const failure = new Error("query failed");
    let closes = 0;
    await assert.rejects(
      withNativeStatement(
        () => true,
        async () => ({
          close: (): void => {
            closes++;
          },
        }),
        async () => {
          throw failure;
        },
      ),
      (error) => error === failure,
    );
    assert.equal(closes, 1);
    await assert.rejects(
      withNativeStatement(
        () => true,
        async () => {
          throw failure;
        },
        async () => 1,
      ),
      (error) => error === failure,
    );
    assert.equal(closes, 1);
  });
  it("preserves query plus finalization failure as an uncertain native resource outcome", async () => {
    const body = new Error("query failed");
    const cleanup = new Error("finalization failed");
    let closes = 0;
    await assert.rejects(
      withNativeStatement(
        () => true,
        async () => ({
          close: (): void => {
            closes++;
            throw cleanup;
          },
        }),
        async () => {
          throw body;
        },
      ),
      (error) => {
        assert(error instanceof NativeStatementUncertainError);
        assert(error.cause instanceof AggregateError);
        assert.deepEqual(error.cause.errors, [body, cleanup]);
        return true;
      },
    );
    assert.equal(closes, 1);
  });
  it("does not attempt more native cleanup after observed transaction loss or unreadability", async () => {
    for (const mode of ["lost", "unreadable"] as const) {
      let finished = false;
      let closes = 0;
      const body = new Error("statement lost transaction");
      await assert.rejects(
        withNativeStatement(
          () => {
            if (finished && mode === "unreadable")
              throw new Error("state unavailable");
            return !finished;
          },
          async () => ({
            close: (): void => {
              closes++;
            },
          }),
          async () => {
            finished = true;
            throw body;
          },
        ),
        (error) => {
          assert(error instanceof NativeStatementUncertainError);
          assert(error.cause instanceof AggregateError);
          assert.equal(error.cause.errors[0], body);
          return true;
        },
      );
      assert.equal(closes, 0);
    }
  });
});
