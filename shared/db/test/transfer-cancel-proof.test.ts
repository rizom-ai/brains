import { describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { z } from "@brains/utils/zod";
import { BinaryTransferClient } from "../src/turso-worker/transfer-client";
import { PersistenceBudgetPool } from "../src/turso-worker/budget-pool";
import { STAGE_CHUNK_BYTES } from "../src/turso-worker/binary-protocol";
import { serializeError } from "../src/turso-worker/error-protocol";

const workerUrl = new URL(
  "../src/turso-worker/transfer-receiver.ts",
  import.meta.url,
);
const eventSchema = z.strictObject({
  kind: z.enum(["opened", "settled"]),
  id: z.string().uuid(),
});
// Real worker/port lifetimes with an intentionally mocked receiver command layer.
// No native SQL or payload acceptance claim is made by these controller tests.
describe.each(["upload", "read"] as const)(
  "explicit %s receiver cancellation",
  (direction) => {
    it.each(["acknowledged", "rejected", "receiver-exit"] as const)(
      "handles %s cleanup without treating a missing reply as release",
      async (mode) => {
        const receiver = new Worker(workerUrl, { workerData: "receiver" });
        const receiverExit = Promise.withResolvers<number>();
        receiver.once("exit", (code) => receiverExit.resolve(code));
        const pool = new PersistenceBudgetPool();
        const budget = direction === "upload" ? pool.ingress : pool.egress;
        const opened = Promise.withResolvers<void>();
        const settled = Promise.withResolvers<void>();
        const requested = Promise.withResolvers<void>();
        const proceed = Promise.withResolvers<void>();
        const cancellation = new AbortController();
        let identity: string | undefined;
        const transfer = new BinaryTransferClient(
          receiver,
          receiverExit.promise,
          pool,
          direction,
          async (grant, port, handoff): Promise<void> => {
            assert.equal(handoff(), true);
            identity = grant.id;
            receiver.postMessage({ kind: "open", grant, port }, [port]);
            await opened.promise;
          },
          async (id): Promise<void> => {
            assert.equal(id, identity);
            requested.resolve();
            if (mode === "rejected")
              throw new Error("Injected cancellation admission failure");
            await proceed.promise;
            if (mode !== "receiver-exit") {
              receiver.postMessage({ kind: "cancel", id });
              await settled.promise;
            }
          },
        );
        receiver.on("message", (input: unknown) => {
          const event = eventSchema.parse(input);
          assert.equal(event.id, identity);
          if (event.kind === "opened") opened.resolve();
          else {
            transfer.settle(event.id, {
              kind: "error",
              error: serializeError(
                new Error("Fixture receiver cancellation acknowledged"),
              ),
            });
            settled.resolve();
          }
        });
        receiver.on("error", (error) => {
          opened.reject(error);
          settled.reject(error);
          transfer.fail(error);
        });
        const rejected = assert.rejects(
          transfer.run(
            {
              generation: crypto.randomUUID(),
              scope: crypto.randomUUID(),
              id: 1,
            },
            () => new Worker(workerUrl, { workerData: "peer" }),
            cancellation.signal,
          ),
          (error: unknown) => {
            assert(error instanceof Error);
            if (mode === "rejected") {
              assert(error instanceof AggregateError);
              assert(
                error.errors.some(
                  (cause: unknown) =>
                    cause instanceof Error &&
                    /admission failure/.test(cause.message),
                ),
              );
            } else assert.match(error.message, /cancelled/);
            return true;
          },
        );
        try {
          await opened.promise;
          cancellation.abort();
          await requested.promise;
          // The peer has already been joined before cancellation is requested.
          // Its missing automatic receiver notification still cannot refund credit.
          expect(budget.stats()).toEqual({
            slots: 1,
            reservedBytes: STAGE_CHUNK_BYTES,
          });
          if (mode === "rejected") {
            await rejected;
            let spawned = false;
            await assert.rejects(
              transfer.run(
                {
                  generation: crypto.randomUUID(),
                  scope: crypto.randomUUID(),
                  id: 2,
                },
                () => {
                  spawned = true;
                  return receiver;
                },
              ),
            );
            assert.equal(spawned, false);
            assert.equal(budget.stats().slots, 1);
            assert(identity);
            // A later real acknowledgement is accepted against the retained entry,
            // rather than misclassified as an unknown reply after task retirement.
            receiver.postMessage({ kind: "cancel", id: identity });
            await settled.promise;
            await assert.rejects(
              transfer.drain(),
              /cleanup could not be confirmed/,
            );
          } else {
            if (mode === "receiver-exit") await receiver.terminate();
            proceed.resolve();
            await rejected;
            await transfer.drain();
          }
          assert.equal(budget.stats().slots, 0);
        } finally {
          proceed.resolve();
          await receiver.terminate();
          await rejected;
        }
      },
    );
  },
);
