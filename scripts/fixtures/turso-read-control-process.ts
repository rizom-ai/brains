// Dedicated control PROCESS. Native opens are forbidden; a separate consumer
// PROCESS owns all payload reads/hashing. This does not boot the application runtime.
import assert from "node:assert/strict";
import { z } from "@brains/utils/zod";
import { LocalDatabaseRpcClient } from "../../shell/core/src/local-database-endpoint";
import { createSqliteDatabase } from "../../shared/db/src/sqlite";
import { TursoThreadProof } from "../../shared/db/test/fixtures/turso-thread/client";
import { NetworkProcessOwner } from "../../shared/db/test/fixtures/turso-thread/network-process-owner";
import { blobFactsSchema } from "../../shared/db/src/turso-worker/blob-protocol";
import {
  readOfferSchema,
  readEndpointSchema,
} from "../../shared/db/test/fixtures/turso-thread/network-read-protocol";
import {
  errorSchema,
  serializeError,
  deserializeError,
} from "../../shared/db/src/turso-worker/error-protocol";
import {
  controlStartSchema,
  controlCommandSchema,
  type ControlStart,
  type ControlEvent,
  type ControlAction,
} from "./turso-read-control-protocol";

const envelopeSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), value: z.unknown() }),
  z.strictObject({ ok: z.literal(false), error: errorSchema }),
]);
const endpointReady = Promise.withResolvers<void>();
const finish = Promise.withResolvers<ControlAction>();
let booted = false;
let readySeen = false;
let finishSeen = false;
function send(event: ControlEvent): void {
  process.send?.(event);
}
process.on("message", (input: unknown) => {
  if (booted) {
    const command = controlCommandSchema.parse(input);
    if (command.kind === "endpoint-ready") {
      assert(!readySeen);
      readySeen = true;
      endpointReady.resolve();
    } else {
      assert(!finishSeen);
      finishSeen = true;
      finish.resolve(command.action);
    }
    return;
  }
  booted = true;
  const options = controlStartSchema.parse(input);
  void run(options).then(
    () => process.disconnect(),
    (error: unknown) => {
      send({ kind: "failed", pid: process.pid, error: serializeError(error) });
      process.exitCode = 1;
      process.disconnect();
    },
  );
});
// Install the listener before inviting bootstrap; no startup timing assumption.
send({
  kind: "ready",
  pid: process.pid,
  executable: process.execPath,
  sidecarUrl: import.meta.url,
});
async function run(options: ControlStart): Promise<void> {
  const progress = (phase: string): void =>
    console.error(`[read-control:${process.pid}] ${phase}`);
  progress("bootstrap received; checking local-open fences");
  assert.equal(process.env["BRAINS_FORBID_LOCAL_DATABASE_OPEN"], "1");
  assert.throws(
    () => createSqliteDatabase({ url: options.forbiddenUrl, schema: {} }),
    /Local SQLite opens are forbidden/,
  );
  assert.throws(
    () =>
      new TursoThreadProof({
        url: options.forbiddenUrl,
        workerUrl: new URL(options.nativeWorkerUrl),
      }),
    /Local SQLite opens are forbidden/,
  );
  send({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
    localOpenFenced: true,
  });
  const client = new LocalDatabaseRpcClient({ config: options.config });
  const consumers = new NetworkProcessOwner(
    options.bunExecutable,
    new URL(options.consumerUrl),
    "read",
  );
  const cancellation = new AbortController();
  const errors: unknown[] = [];
  let transfer: Promise<unknown> | undefined;
  let result: Extract<ControlEvent, { kind: "finished" }> | undefined;
  async function call(input: unknown, signal?: AbortSignal): Promise<unknown> {
    assert(Buffer.byteLength(JSON.stringify(input)) <= 1024);
    const reply = envelopeSchema.parse(
      await client.request("large-read-proof", input, { signal }),
    );
    if (!reply.ok) throw deserializeError(reply.error);
    assert(Buffer.byteLength(JSON.stringify(reply.value)) <= 1024);
    return reply.value;
  }
  try {
    progress("checking authentication rejection");
    const unauthenticated = new LocalDatabaseRpcClient({
      config: { ...options.config, secret: "invalid-control-secret" },
    });
    try {
      await assert.rejects(
        unauthenticated.request("large-read-proof", {
          operation: "offer",
          target: "public",
        }),
      );
    } finally {
      unauthenticated.close();
    }
    progress("auth rejection checked; identifying authenticated connection");
    const connectionId = z
      .string()
      .uuid()
      .parse(await call({ operation: "identify" }));
    await assert.rejects(
      call({ operation: "offer", target: "private" }),
      /not authorized/,
    );
    progress("private target rejected; preparing empty sibling");
    const sibling = readOfferSchema.parse(
      await call({ operation: "offer", target: "empty" }),
    );
    progress("preparing full snapshot");
    const read = readOfferSchema.parse(
      await call({ operation: "offer", target: "public" }),
    );
    progress("snapshot offered; requesting transfer");
    const facts = { sizeBytes: read.sizeBytes, sha256: read.sha256 };
    send({
      kind: "offered",
      pid: process.pid,
      connectionId,
      ticket: read.ticket,
      facts,
    });
    transfer = call(
      { operation: "download", ticket: read.ticket },
      cancellation.signal,
    );
    void transfer.catch(() => undefined); // Awaited below and joined on failed-scenario cleanup.
    await Promise.race([
      endpointReady.promise,
      transfer.then(() => {
        throw new Error("Read completed before endpoint rendezvous");
      }),
    ]);
    const address = readEndpointSchema.parse(
      await call({ operation: "endpoint", ticket: read.ticket }),
    );
    progress("endpoint ready; spawning payload consumer");
    const consumer = consumers.spawn();
    consumer.start({
      direction: "read",
      endpoint: address,
      facts,
      pauseAfterBytes: 17 * 1024 * 1024,
    });
    const prefix = await consumer.held;
    assert.equal(prefix.direction, "read");
    // The control process can complete authenticated RPC while its separate
    // payload process is deliberately paused with a circulating credit.
    assert.equal(await call({ operation: "identify" }), connectionId);
    send({
      kind: "held",
      pid: process.pid,
      consumerPid: consumer.pid,
      prefix: { sizeBytes: prefix.sizeBytes, sha256: prefix.sha256 },
    });
    // This control event is handled while the independent payload actor is paused.
    const action = await finish.promise;
    let controlReusableAfterCancel = false;
    if (action === "complete") {
      consumer.resume();
      assert.deepEqual(await consumer.result, facts);
      assert.equal(await consumer.exited, 0);
      assert.deepEqual(blobFactsSchema.parse(await transfer), facts);
      await call({ operation: "cancel", ticket: sibling.ticket });
    } else {
      if (action === "consumer-kill") {
        // SIGKILL is sent through the owned subprocess handle. No RPC cancellation
        // or client close may manufacture the data-disconnect failure here.
        const killed = consumer.killForProof();
        assert.equal(consumer.killForProof(), killed);
        assert.notEqual(await killed, 0);
        assert.equal(consumers.stats().children, 0);
      } else if (action === "disconnect") client.close();
      else cancellation.abort();
      await assert.rejects(transfer);
      if (action === "consumer-kill")
        await assert.rejects(
          call({ operation: "endpoint", ticket: read.ticket }),
          /Unknown or foreign read endpoint/,
        );
      if (action === "cancel" || action === "consumer-kill") {
        assert.equal(await call({ operation: "identify" }), connectionId);
        await call({ operation: "cancel", ticket: sibling.ticket });
        controlReusableAfterCancel = action === "cancel";
      }
      await consumers.close();
      await assert.rejects(consumer.result);
      assert.notEqual(await consumer.exited, 0);
    }
    await consumers.close();
    assert.equal(consumers.stats().children, 0);
    result = {
      kind: "finished",
      pid: process.pid,
      action,
      consumerPid: consumer.pid,
      consumerJoined: true,
      controlReusableAfterCancel,
    };
  } catch (error) {
    errors.push(error);
    cancellation.abort();
  }
  client.close();
  try {
    await consumers.close();
  } catch (error) {
    if (!errors.includes(error)) errors.push(error);
  }
  if (transfer) await Promise.allSettled([transfer]); // Cancellation failures were observed; do not leave a control request pending.
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "Control process and consumer cleanup failed",
      { cause: errors.at(-1) },
    );
  assert(result);
  send(result);
}
