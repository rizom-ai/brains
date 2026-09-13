import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { deserializeError } from "../src/turso-worker/error-protocol";
import {
  cursorEventSchema,
  type CursorBoot,
  type CursorCommand,
  type CursorEvent,
  type CursorPhase,
} from "./fixtures/turso-thread/cursor-scan-protocol";

type Done = Extract<CursorEvent, { kind: "done" }>;
type Gate = Extract<CursorEvent, { kind: "gate" }>;
function actor(options: CursorBoot): {
  done: Promise<Done>;
  exited: Promise<number>;
  gate: (phase: CursorPhase) => Promise<Gate>;
  send: (command: CursorCommand) => void;
  stop: () => Promise<void>;
} {
  const done = Promise.withResolvers<Done>();
  void done.promise.catch(() => undefined); // Asserted via gates/done; startup failures race every rendezvous.
  const gates = new Map<
    CursorPhase,
    ReturnType<typeof Promise.withResolvers<Gate>>
  >();
  for (const phase of [
    "row",
    "statement-closed",
    "rollback-completed",
  ] as const)
    gates.set(phase, Promise.withResolvers<Gate>());
  const seen = new Set<CursorPhase>();
  let expected: CursorPhase | "done" =
    options.operation === "recover" ? "done" : "row";
  const worker = new Worker(
    new URL("./fixtures/turso-thread/cursor-scan-worker.ts", import.meta.url),
    { workerData: options },
  );
  const exited = new Promise<number>((resolve) =>
    worker.once("exit", (code) => {
      resolve(code);
      done.reject(
        new Error(`Cursor worker exited before settlement (${code})`),
      );
    }),
  );
  worker.on("error", (error) => done.reject(error));
  worker.on("message", (input: unknown) => {
    try {
      const event = cursorEventSchema.parse(input);
      if (event.kind === "failed") done.reject(deserializeError(event.error));
      else if (event.kind === "done") done.resolve(event);
      else {
        assert.equal(event.phase, expected, "Unexpected native cursor gate");
        assert(!seen.has(event.phase));
        seen.add(event.phase);
        expected =
          event.phase === "row"
            ? options.scenario === "return-ack"
              ? "done"
              : "statement-closed"
            : event.phase === "statement-closed"
              ? options.scenario === "close-ack"
                ? "done"
                : "rollback-completed"
              : "done";
        gates.get(event.phase)?.resolve(event);
      }
    } catch (error) {
      done.reject(error);
    }
  });
  let stopping: Promise<void> | undefined;
  return {
    done: done.promise,
    exited,
    gate: async (phase): Promise<Gate> => {
      const gate = gates.get(phase);
      assert(gate);
      return Promise.race([
        gate.promise,
        done.promise.then((value) => {
          throw new Error(`Cursor settled before ${phase}`, {
            cause: value.error ? deserializeError(value.error) : undefined,
          });
        }),
      ]);
    },
    send: (command): void => worker.postMessage(command),
    stop: (): Promise<void> => {
      stopping ??= (async (): Promise<void> => {
        await worker.terminate();
        await exited;
      })();
      return stopping;
    },
  };
}

describe("small native cursor lifecycle component (not authenticated/runtime acceptance)", () => {
  for (const plan of ["sorted", "offsets-first"] as const)
    it.each([
      "complete",
      "cancel",
      "return-ack",
      "close-ack",
      "rollback-ack",
    ] as const)(
      `${plan}: orders cursor return, close, rollback and reuse for %s`,
      async (scenario) => {
        const directory = await mkdtemp(
          join(tmpdir(), "turso-cursor-lifecycle-"),
        );
        const url = pathToFileURL(join(directory, "cursor.db")).href;
        const original = actor({ url, scenario, plan, operation: "scan" });
        let recovery: ReturnType<typeof actor> | undefined;
        let clean = false;
        const failures: unknown[] = [];
        try {
          const row = await original.gate("row");
          expect(row.state).toEqual({
            rows: 1,
            nextCalls: 1,
            returnCalls: 0,
            closeCalls: 0,
            rollbackCalls: 0,
            probeCalls: 0,
            probeQueued: false,
            inTransaction: true,
          });
          original.send({ kind: "probe" });
          original.send({ kind: "release", phase: "row" });
          if (scenario !== "return-ack") {
            const closed = await original.gate("statement-closed");
            assert.equal(closed.state.rows, scenario === "complete" ? 3 : 1);
            assert.equal(
              closed.state.nextCalls,
              scenario === "complete" ? 4 : 1,
            );
            assert.equal(closed.state.returnCalls, 1);
            assert.equal(closed.state.closeCalls, 1);
            assert.equal(closed.state.rollbackCalls, 0);
            assert.equal(closed.state.probeCalls, 0);
            assert.equal(closed.state.probeQueued, true);
            assert.equal(closed.state.inTransaction, true);
            original.send({ kind: "release", phase: "statement-closed" });
            if (scenario !== "close-ack") {
              const rolledBack = await original.gate("rollback-completed");
              assert.equal(rolledBack.state.rollbackCalls, 1);
              assert.equal(rolledBack.state.inTransaction, false);
              assert.equal(rolledBack.state.probeCalls, 0); // Actual native completion is not an acknowledged release yet.
              original.send({ kind: "release", phase: "rollback-completed" });
            }
          }
          const result = await original.done;
          const healthy = scenario === "complete" || scenario === "cancel";
          assert.equal(result.nativeClosed, healthy);
          assert.equal(result.recovered, false);
          assert.equal(result.state.probeCalls, healthy ? 1 : 0);
          assert.equal(result.state.returnCalls, 1);
          assert.equal(
            result.state.closeCalls,
            scenario === "return-ack" ? 0 : 1,
          );
          assert.equal(
            result.state.rollbackCalls,
            scenario === "return-ack" || scenario === "close-ack" ? 0 : 1,
          );
          if (scenario === "complete") assert.equal(result.error, undefined);
          else {
            const error = deserializeError(result.error);
            if (scenario === "cancel")
              assert.equal(error.message, "Cursor read revoked");
            else if (scenario === "rollback-ack") {
              assert(error instanceof AggregateError);
              assert.equal(error.cause, error.errors[1]);
              assert.equal(error.errors[0].message, "Cursor read revoked");
              assert.match(
                error.errors[1].message,
                /rollback acknowledgement loss/,
              );
            } else {
              assert.equal(error.name, "NativeStatementUncertainError");
              assert(error.cause instanceof AggregateError);
              if (scenario === "return-ack") {
                assert.equal(error.cause.errors[0], error.cause.errors[1]);
                const inner = error.cause.errors[0];
                assert(inner instanceof AggregateError);
                assert.equal(inner.cause, inner.errors[1]);
                assert.equal(inner.errors[0].message, "Cursor read revoked");
                assert.match(
                  inner.errors[1].message,
                  /return acknowledgement loss/,
                );
              } else {
                assert.equal(error.cause.cause, error.cause.errors[1]);
                assert.equal(
                  error.cause.errors[0].message,
                  "Cursor read revoked",
                );
                assert.match(
                  error.cause.errors[1].message,
                  /close acknowledgement loss/,
                );
              }
            }
          }
          if (healthy) {
            assert.equal(await original.exited, 0);
            clean = true;
          } else {
            // Fresh-owner WAL-preserving recovery ONLY AFTER actual old worker exit.
            await original.stop();
            await original.exited;
            recovery = actor({ url, scenario, plan, operation: "recover" });
            const recovered = await recovery.done;
            assert.equal(recovered.nativeClosed, true);
            assert.equal(recovered.recovered, true);
            assert.equal(recovered.state.probeCalls, 1);
            assert.equal(await recovery.exited, 0);
            clean = true;
          }
        } catch (error) {
          failures.push(error);
        }
        const cleanup = await Promise.allSettled([
          original.stop(),
          ...(recovery ? [recovery.stop()] : []),
        ]);
        for (const result of cleanup)
          if (result.status === "rejected") failures.push(result.reason);
        if (clean && failures.length === 0)
          await rm(directory, { recursive: true, force: true });
        else console.error(`Retained cursor lifecycle fixture: ${directory}`);
        if (failures.length === 1) throw failures[0];
        if (failures.length > 1)
          throw new AggregateError(
            failures,
            "Cursor lifecycle and cleanup failed",
            { cause: failures.at(-1) },
          );
      },
    );
});
