// Opt-in source/installed proof: authenticated control + full-size network read.
// Includes separate control/consumer processes; does not boot the application.
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  controlEventSchema,
  type ControlEvent,
  type ControlAction,
} from "./fixtures/turso-read-control-protocol";
import { z } from "@brains/utils/zod";
import {
  resolveAuthenticatedSidecars,
  authenticatedProfileSchema,
} from "./fixtures/turso-authenticated-sidecars";
import { sql } from "drizzle-orm";
import { blob, text, sqliteTable } from "drizzle-orm/sqlite-core";
import {
  LocalDatabaseRpcServer,
  LocalDatabaseRpcClient,
} from "../shell/core/src/local-database-endpoint";
import { TursoThreadProof } from "../shared/db/test/fixtures/turso-thread/client";
import { ProofBudgetPool } from "../shared/db/test/fixtures/turso-thread/budget-pool";
import { ScopedReads } from "../shared/db/test/fixtures/turso-thread/scoped-reads";
import {
  readOfferSchema,
  readEndpointSchema,
  type ReadOffer,
} from "../shared/db/test/fixtures/turso-thread/network-read-protocol";
import {
  blobFactsSchema,
  type BlobFacts,
} from "../shared/db/src/turso-worker/blob-protocol";
import {
  STAGE_BUDGET_BYTES,
  STAGE_CHUNK_BYTES,
} from "../shared/db/test/fixtures/turso-thread/binary-protocol";
import { NETWORK_SCRATCH_BYTES } from "../shared/db/test/fixtures/turso-thread/network-wire";
import { withBinaryTransaction } from "../shared/db/test/fixtures/turso-thread/binary-transaction";
import { uploadNetworkFixture } from "../shared/db/test/fixtures/turso-thread/network-exercise";
import { NetworkProcessOwner } from "../shared/db/test/fixtures/turso-thread/network-process-owner";
import {
  errorSchema,
  serializeError,
  deserializeError,
} from "../shared/db/src/turso-worker/error-protocol";

const SIZE = 100 * 1024 * 1024;
const SHA = "412f60e4a630f1d60653186ad3d80f2a04e0e1ff779c21f46bf176e304c5a260";
assert.equal(STAGE_BUDGET_BYTES, SIZE);
const facts: BlobFacts = { sizeBytes: SIZE, sha256: SHA };
const mode = z.enum(["source", "installed"]).parse(process.argv[2]);
const profile = authenticatedProfileSchema.parse(process.argv[3] ?? "full");
if (profile === "consumer-kill") process.env["PROOF_READ_PROGRESS"] = "1";
function progress(phase: string): void {
  console.error(`[authenticated-read:${profile}] ${phase}`);
}
const sidecars = resolveAuthenticatedSidecars(
  mode,
  process.env["PROOF_AUTH_SIDECARS"],
);
const nativeWorker = new URL(sidecars.nativeWorker);
const bridgeUrl = new URL(sidecars.readBridge);
const consumerUrl = new URL(sidecars.consumer);
const inputSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("identify") }),
  z.strictObject({
    operation: z.literal("offer"),
    target: z.enum(["public", "private", "empty"]),
  }),
  z.strictObject({
    operation: z.enum(["download", "endpoint", "cancel"]),
    ticket: z.string().uuid(),
  }),
]);
const envelopeSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), value: z.unknown() }),
  z.strictObject({ ok: z.literal(false), error: errorSchema }),
]);
const listeningSchema = z.strictObject({
  kind: z.literal("network-listening"),
  endpoint: readEndpointSchema,
  pid: z.number().int().positive(),
  threadId: z.number().int().positive(),
});
const payloads = sqliteTable("authenticated_payloads", {
  id: text("id").primaryKey(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
});
const directory = await mkdtemp(join(tmpdir(), "turso-auth-large-read-"));
const path = join(directory, "source.db");
const pool = new ProofBudgetPool();
const driver = new TursoThreadProof({
  url: pathToFileURL(path).href,
  workerUrl: nativeWorker,
  budget: pool,
});
const broker = new ScopedReads(driver);
const config = {
  address: join(directory, "control.sock"),
  secret: crypto.randomUUID() + crypto.randomUUID(),
  sessionId: "owner",
};
const server = new LocalDatabaseRpcServer({ config }); // Existing default framing; no enlarged binary RPC.
const clients: LocalDatabaseRpcClient[] = [];
const remotes: NetworkProcessOwner[] = [];
const downloads: Promise<BlobFacts>[] = [];
const connections = new Map<string, AbortSignal>();
const identities = new WeakMap<AbortSignal, string>();
const endpoints = new Map<
  string,
  {
    connection: AbortSignal;
    ready: Promise<z.output<typeof readEndpointSchema>>;
  }
>();
let admitted: (() => void) | undefined;
let bridges = 0;
const controlProcesses = new Set<{ stop: () => Promise<void> }>();
let restored: TursoThreadProof | undefined;
function client(secret = config.secret): LocalDatabaseRpcClient {
  const value = new LocalDatabaseRpcClient({
    config: { ...config, secret, sessionId: "same-claimed-session" },
  });
  clients.push(value);
  return value;
}
async function call(
  client: LocalDatabaseRpcClient,
  input: z.input<typeof inputSchema>,
  signal?: AbortSignal,
): Promise<unknown> {
  // These are control metadata bounds, not a replacement for transport framing.
  assert(Buffer.byteLength(JSON.stringify(input)) <= 1024);
  const reply = envelopeSchema.parse(
    await client.request("large-read-proof", input, { signal }),
  );
  if (!reply.ok) throw deserializeError(reply.error);
  assert(Buffer.byteLength(JSON.stringify(reply.value)) <= 1024);
  return reply.value;
}
async function connection(
  client: LocalDatabaseRpcClient,
): Promise<AbortSignal> {
  const id = z
    .string()
    .uuid()
    .parse(await call(client, { operation: "identify" }));
  const signal = connections.get(id);
  assert(signal);
  return signal;
}
async function offer(
  client: LocalDatabaseRpcClient,
  target: "public" | "empty" = "public",
): Promise<ReadOffer> {
  return readOfferSchema.parse(
    await call(client, { operation: "offer", target }),
  );
}
async function begin(
  client: LocalDatabaseRpcClient,
  read: ReadOffer,
  signal?: AbortSignal,
): Promise<{
  completion: Promise<BlobFacts>;
  address: z.output<typeof readEndpointSchema>;
}> {
  const started = Promise.withResolvers<void>();
  admitted = (): void => started.resolve();
  const completion = call(
    client,
    { operation: "download", ticket: read.ticket },
    signal,
  ).then((value) => blobFactsSchema.parse(value));
  assert(downloads.length < 16);
  downloads.push(completion);
  void completion.catch(() => undefined); // Observed by the scenario, or joined during failed-scenario cleanup.
  await Promise.race([
    started.promise,
    completion.then(() => {
      throw new Error("Read completed without bridge admission");
    }),
  ]);
  const address = readEndpointSchema.parse(
    await call(client, { operation: "endpoint", ticket: read.ticket }),
  );
  return { completion, address };
}
function remote(
  address: z.output<typeof readEndpointSchema>,
  read: ReadOffer,
  pauseAfterBytes = STAGE_CHUNK_BYTES,
): {
  owner: NetworkProcessOwner;
  peer: ReturnType<NetworkProcessOwner["spawn"]>;
} {
  const owner = new NetworkProcessOwner(
    sidecars.bunExecutable,
    consumerUrl,
    "read",
  );
  remotes.push(owner);
  const peer = owner.spawn();
  peer.start({
    direction: "read",
    endpoint: address,
    facts: { sizeBytes: read.sizeBytes, sha256: read.sha256 },
    pauseAfterBytes,
  });
  return { owner, peer };
}
async function runControlProcess(
  action: ControlAction,
  progressId: number,
): Promise<{ action: ControlAction; controlPid: number; consumerPid: number }> {
  assert.equal(controlProcesses.size, 0); // One harness-owned control process at a time; no spawn queue.
  const sidecar = new URL(sidecars.control);
  const forbiddenPath = join(directory, `forbidden-${action}.db`);
  const held = Promise.withResolvers<Extract<ControlEvent, { kind: "held" }>>();
  const done =
    Promise.withResolvers<Extract<ControlEvent, { kind: "finished" }>>();
  void held.promise.catch(() => undefined); // Observed below, including early startup/exit failures.
  void done.promise.catch(() => undefined); // Observed below or through orderly shutdown.
  let phase = 0;
  let ready = false;
  let connectionId: string | undefined;
  let terminal = false;
  let finishSent = false;
  let protocolFailure: unknown;
  const reject = (error: unknown): void => {
    protocolFailure ??= error;
    held.reject(error);
    done.reject(error);
  };
  const child = Bun.spawn([sidecars.bunExecutable, fileURLToPath(sidecar)], {
    env: { ...process.env, BRAINS_FORBID_LOCAL_DATABASE_OPEN: "1" },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
    ipc: (input: unknown): void => {
      try {
        const message = controlEventSchema.parse(input);
        assert.equal(message.pid, child.pid);
        assert.notEqual(message.pid, process.pid);
        assert(!terminal);
        if (message.kind === "ready") {
          assert(!ready);
          assert.equal(phase, 0);
          assert.equal(message.executable, sidecars.bunExecutable);
          assert.equal(message.sidecarUrl, sidecar.href);
          ready = true;
          progress(`${action}: control IPC ready; sending bootstrap`);
          child.send({
            kind: "start",
            config: { ...config, sessionId: "separate-control-process" },
            consumerUrl: consumerUrl.href,
            nativeWorkerUrl: nativeWorker.href,
            forbiddenUrl: pathToFileURL(forbiddenPath).href,
            bunExecutable: sidecars.bunExecutable,
          });
          return;
        }
        assert(ready);
        if (message.kind === "failed") {
          terminal = true;
          reject(deserializeError(message.error));
          return;
        }
        if (message.kind === "runtime") {
          assert.equal(phase++, 0);
          assert.equal(message.executable, sidecars.bunExecutable);
          assert.equal(message.sidecarUrl, sidecar.href);
          assert.equal(message.localOpenFenced, true);
        } else if (message.kind === "offered") {
          assert.equal(phase++, 1);
          connectionId = message.connectionId;
          assert(connections.has(connectionId));
          assert.deepEqual(message.facts, facts);
        } else if (message.kind === "held") {
          assert.equal(phase++, 2);
          assert.notEqual(message.consumerPid, child.pid);
          assert.notEqual(message.consumerPid, process.pid);
          assert.equal(message.prefix.sizeBytes, 17 * 1024 * 1024);
          held.resolve(message);
        } else {
          assert.equal(phase++, 3);
          terminal = true;
          assert(finishSent);
          done.resolve(message);
        }
      } catch (error) {
        reject(error);
      }
    },
  });
  let stopping: Promise<void> | undefined;
  const owned = {
    stop: (): Promise<void> => {
      stopping ??= (async (): Promise<void> => {
        // Cooperative shutdown lets the control process join its own consumer.
        // Hard-killed control processes/grandchild recovery are not claimed here.
        let sendFailure: unknown;
        try {
          if (child.exitCode === null && !terminal && !finishSent) {
            finishSent = true;
            child.send({ kind: "finish", action: "disconnect" });
          }
        } catch (error) {
          sendFailure = error;
        }
        try {
          await child.exited;
        } catch (error) {
          if (sendFailure !== undefined)
            throw new AggregateError(
              [sendFailure, error],
              "Control shutdown send and join failed",
              { cause: error },
            );
          throw error;
        }
        if (sendFailure !== undefined) throw sendFailure;
      })();
      return stopping;
    },
  };
  controlProcesses.add(owned);
  void child.exited.then((code) => {
    controlProcesses.delete(owned);
    if (!terminal)
      reject(
        new Error(
          `Control process exited without completion (${code}; ${sidecar.href})`,
        ),
      );
  });
  admitted = (): void => {
    try {
      child.send({ kind: "endpoint-ready" });
    } catch (error) {
      reject(error);
    } // Never throw after the server factory has created its bridge.
  };

  let result:
    | { action: ControlAction; controlPid: number; consumerPid: number }
    | undefined;
  const failures: unknown[] = [];
  try {
    const paused = await held.promise;
    progress(`${action}: consumer held at 17 MiB; checking writer progress`);
    assert.equal(pool.stats().residentBytes, SIZE);
    assert.equal(pool.stats().scratchSlots, 0);
    await driver.execute({
      sql: "INSERT INTO read_progress VALUES (?)",
      args: [progressId],
    });
    finishSent = true;
    child.send({ kind: "finish", action });
    const completed = await done.promise;
    assert.equal(completed.action, action);
    assert.equal(completed.consumerPid, paused.consumerPid);
    assert.equal(completed.controlReusableAfterCancel, action === "cancel");
    assert.equal(await child.exited, 0);
    assert(connectionId);
    const signal = connections.get(connectionId);
    assert(signal);
    await broker.retirement(signal);
    released();
    assert.equal(
      (await driver.execute({ sql: "SELECT count(*) FROM read_progress" }))
        .rows[0]?.[0],
      progressId,
    );
    assert.equal(await Bun.file(forbiddenPath).exists(), false);
    result = {
      action,
      controlPid: child.pid,
      consumerPid: completed.consumerPid,
    };
  } catch (error) {
    failures.push(error);
  }
  try {
    await owned.stop();
  } catch (cleanup) {
    failures.push(cleanup);
  }
  if (protocolFailure !== undefined && !failures.includes(protocolFailure))
    failures.push(protocolFailure);
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1)
    throw new AggregateError(failures, "Control process and shutdown failed", {
      cause: failures.at(-1),
    });
  assert(result);
  return result;
}
function released(): void {
  assert.deepEqual(broker.stats(), { admissions: 0, tickets: 0 });
  assert.equal(pool.stats().residentBytes, 0);
  assert.equal(pool.stats().scratchBytes, 0);
  for (const budget of [
    pool.ingress,
    pool.egress,
    pool.networkIngress,
    pool.networkEgress,
  ])
    assert.equal(budget.stats().slots, 0);
  assert.equal(endpoints.size, 0);
}
async function seed(): Promise<void> {
  await driver.executeMultiple(
    "CREATE TABLE authenticated_payloads (id TEXT PRIMARY KEY, bytes BLOB NOT NULL); INSERT INTO authenticated_payloads VALUES ('empty', zeroblob(0)), ('private', x'FE'); CREATE TABLE read_progress (id INTEGER PRIMARY KEY)",
  );
  const scope = await driver.openBinaryScope();
  try {
    const stage = await scope.begin({
      reservationBytes: SIZE,
      expectedSize: SIZE,
      expectedDigest: SHA,
    });
    // Generic credited ingress is fixture setup, NOT authenticated upload evidence.
    await uploadNetworkFixture(driver, pool, stage, SIZE, {
      bridgeUrl: new URL(sidecars.uploadBridge),
      producerUrl: new URL(sidecars.producer),
      bunExecutable: sidecars.bunExecutable,
    });
    const claim = await scope.reserve(stage);
    await withBinaryTransaction(driver, [claim], async (context) => {
      await context.executeBound(
        context.db
          .insert(payloads)
          .values({ id: "public", bytes: sql`${sql.placeholder("body")}` }),
        new Map([["body", claim]]),
      );
    });
  } catch (error) {
    try {
      await scope.close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Large read fixture seed and cleanup failed",
        { cause: cleanup },
      );
    }
    throw error;
  }
  await scope.close();
  released();
}
server.register(
  "large-read-proof",
  async (input, context): Promise<unknown> => {
    try {
      const request = inputSchema.parse(input);
      let value: unknown;
      switch (request.operation) {
        case "identify": {
          const id =
            identities.get(context.connectionSignal) ?? crypto.randomUUID();
          identities.set(context.connectionSignal, id);
          connections.set(id, context.connectionSignal);
          value = id;
          break;
        }
        case "offer":
          if (request.target === "private")
            throw new Error("Read target is not authorized"); // Fixture allowlist, not a production ACL.
          value = await broker.offer(context, {
            table: "authenticated_payloads",
            column: "bytes",
            key: [{ column: "id", value: request.target }],
            maxBytes: request.target === "public" ? SIZE : 0,
          });
          break;
        case "download":
          value = await broker.download(context, request.ticket, () => {
            const ready =
              Promise.withResolvers<z.output<typeof readEndpointSchema>>();
            void ready.promise.catch(() => undefined); // Endpoint lookup and transfer exit observe failed startup.
            const peer = pool.networkEgress.spawn(() => new Worker(bridgeUrl));
            bridges++;
            endpoints.set(request.ticket, {
              connection: context.connectionSignal,
              ready: ready.promise,
            });
            peer.once("message", (input: unknown) => {
              try {
                const message = listeningSchema.parse(input);
                assert.equal(message.pid, process.pid);
                assert.equal(message.threadId, peer.threadId);
                ready.resolve(message.endpoint);
              } catch (error) {
                ready.reject(error);
              } // Caller cancels the original download on failed rendezvous.
            });
            peer.once("error", (error) => ready.reject(error));
            peer.once("exit", () => {
              endpoints.delete(request.ticket);
              ready.reject(
                new Error("Read bridge exited before endpoint delivery"),
              );
            });
            admitted?.();
            return peer;
          });
          break;
        case "endpoint": {
          const endpoint = endpoints.get(request.ticket);
          if (endpoint?.connection !== context.connectionSignal)
            throw new Error("Unknown or foreign read endpoint");
          endpoints.delete(request.ticket);
          value = await endpoint.ready;
          if (context.connectionSignal.aborted || context.signal.aborted)
            throw new Error("Read endpoint revoked");
          break;
        }
        case "cancel":
          await broker.cancel(context, request.ticket);
          value = null;
      }
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    } // Preserve bounded causes through the existing control transport.
  },
);
const errors: unknown[] = [];
let report: Record<string, unknown> | undefined;
try {
  progress("seeding 100 MiB through credited ingress");
  await seed();
  progress("seed committed; starting authenticated server");
  await server.initialize();
  const cases: {
    mode: string;
    receivedBytes: number;
    prefixSha256?: string;
  }[] = [];
  let harnessWrites = 0;
  if (profile === "full") {
    await assert.rejects(offer(client("wrong-secret")));
    const first = client();
    const other = client();
    const firstSignal = await connection(first);
    await assert.rejects(
      call(first, { operation: "offer", target: "private" }),
      /not authorized/,
    );
    released();
    const read = await offer(first);
    assert.deepEqual({ sizeBytes: read.sizeBytes, sha256: read.sha256 }, facts);
    assert.equal(pool.stats().residentBytes, SIZE);
    assert.equal(pool.stats().scratchSlots, 0);
    await assert.rejects(offer(other), /capacity exceeded/); // No second full backing or native snapshot is admitted.
    await assert.rejects(
      call(other, { operation: "download", ticket: read.ticket }),
      /foreign/,
    );
    assert.equal(bridges, 0);
    const transfer = await begin(first, read);
    await assert.rejects(
      call(first, { operation: "download", ticket: read.ticket }),
      /Unknown/,
    );
    await assert.rejects(
      call(first, { operation: "endpoint", ticket: read.ticket }),
      /Unknown/,
    );
    const consumer = remote(transfer.address, read, SIZE);
    assert.deepEqual(await consumer.peer.held, { direction: "read", ...facts });
    assert.equal(pool.egress.stats().reservedBytes, STAGE_CHUNK_BYTES);
    assert.equal(
      pool.networkEgress.stats().reservedBytes,
      NETWORK_SCRATCH_BYTES,
    );
    await driver.execute({ sql: "INSERT INTO read_progress VALUES (1)" });
    consumer.peer.resume();
    assert.deepEqual(await consumer.peer.result, facts);
    assert.equal(await consumer.peer.exited, 0);
    assert.deepEqual(await transfer.completion, facts);
    await consumer.owner.close();
    await broker.retirement(firstSignal);
    released();
    type Mode =
      | "before-consumer"
      | "request-cancel"
      | "control-disconnect"
      | "data-disconnect";
    const scenarios: { mode: Mode; pauseAfterBytes: number }[] = [
      { mode: "before-consumer", pauseAfterBytes: 0 },
    ];
    for (const pauseAfterBytes of [STAGE_CHUNK_BYTES, 17 * 1024 * 1024, SIZE])
      for (const mode of [
        "request-cancel",
        "control-disconnect",
        "data-disconnect",
      ] as const)
        scenarios.push({ mode, pauseAfterBytes });
    for (const { mode, pauseAfterBytes } of scenarios) {
      progress(`${mode}: checkpoint ${pauseAfterBytes} bytes`);
      const control = client();
      const signal = await connection(control);
      // An empty sibling proves cancellation is not blanket connection revocation.
      const siblingClient = mode === "control-disconnect" ? other : control;
      const sibling = await offer(siblingClient, "empty");
      const read = await offer(control);
      assert.equal(read.sizeBytes, SIZE);
      assert.equal(read.sha256, SHA);
      const cancellation = new AbortController();
      const transfer = await begin(control, read, cancellation.signal);
      const rejected = assert.rejects(transfer.completion);
      let transferSettled = false;
      void transfer.completion.then(
        () => {
          transferSettled = true;
        },
        () => {
          transferSettled = true;
        },
      );
      const consumer =
        mode === "before-consumer"
          ? undefined
          : remote(transfer.address, read, pauseAfterBytes);
      let prefix: BlobFacts | undefined;
      if (consumer) {
        const held = await consumer.peer.held;
        assert.equal(held.direction, "read");
        prefix = { sizeBytes: held.sizeBytes, sha256: held.sha256 };
        assert.equal(prefix.sizeBytes, pauseAfterBytes);
        if (pauseAfterBytes === SIZE) assert.deepEqual(prefix, facts);
      }
      // Even full body receipt does not manufacture the missing final credit ACK.
      assert.equal(transferSettled, false);
      assert.equal(pool.egress.stats().reservedBytes, STAGE_CHUNK_BYTES);
      assert.equal(pool.stats().residentBytes, SIZE);
      assert.equal(pool.stats().scratchSlots, 0);
      await driver.execute({
        sql: "INSERT INTO read_progress VALUES (?)",
        args: [cases.length + 2],
      });
      if (mode === "control-disconnect") control.close();
      else if (mode === "data-disconnect") {
        assert(consumer);
        await consumer.owner.close();
      } else cancellation.abort();
      await rejected;
      // Ordered after a request-cancel frame on the same live control socket.
      assert.equal(broker.stats().tickets, 1);
      await call(siblingClient, {
        operation: "cancel",
        ticket: sibling.ticket,
      });
      await broker.retirement(signal);
      released();
      if (mode !== "control-disconnect") assert.equal(signal.aborted, false);
      if (consumer) {
        if (mode !== "data-disconnect")
          assert.equal(consumer.owner.stats().children, 1); // Server release does not claim remote copies were freed.
        await consumer.owner.close();
        await assert.rejects(consumer.peer.result);
        assert.notEqual(await consumer.peer.exited, 0);
        assert.equal(consumer.owner.stats().children, 0);
      }
      await assert.rejects(
        call(other, { operation: "download", ticket: read.ticket }),
        /Unknown/,
      );
      cases.push({
        mode,
        receivedBytes: prefix?.sizeBytes ?? 0,
        ...(prefix && { prefixSha256: prefix.sha256 }),
      });
    }
    assert.equal(bridges, scenarios.length + 1);
    harnessWrites = scenarios.length + 1;
  }
  const processControl: {
    action: ControlAction;
    controlPid: number;
    consumerPid: number;
  }[] = [];
  const actions: ControlAction[] =
    profile === "full"
      ? ["complete", "cancel", "disconnect", "consumer-kill"]
      : ["consumer-kill"];
  for (const action of actions) {
    progress(
      `${action}: starting separate control process and materializing snapshot`,
    );
    processControl.push(
      await runControlProcess(
        action,
        harnessWrites + processControl.length + 1,
      ),
    );
    progress(
      `${action}: control/consumer joined; quotas released; owner reusable`,
    );
  }
  assert.equal(controlProcesses.size, 0);
  assert.equal(bridges, harnessWrites + processControl.length);
  progress("normal close and main-file restore verification");
  await driver.close();
  const restoredPath = join(directory, "restored.db");
  await copyFile(path, restoredPath);
  restored = new TursoThreadProof({
    url: pathToFileURL(restoredPath).href,
    workerUrl: nativeWorker,
  });
  const restoredRead = await restored.openReadScope();
  try {
    const verified = await restoredRead.prepare({
      table: "authenticated_payloads",
      column: "bytes",
      key: [{ column: "id", value: "public" }],
      maxBytes: SIZE,
      expectedSize: SIZE,
    });
    assert.deepEqual(
      { sizeBytes: verified.sizeBytes, sha256: verified.sha256 },
      facts,
    );
  } catch (error) {
    try {
      await restoredRead.close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Restored read verification and cleanup failed",
        { cause: cleanup },
      );
    }
    throw error;
  }
  await restoredRead.close();
  assert.equal(
    (await restored.execute({ sql: "SELECT count(*) AS n FROM read_progress" }))
      .rows[0]?.["n"],
    harnessWrites + processControl.length,
  );
  report = {
    profile,
    restoredProgressWrites: harnessWrites + processControl.length,
    scope:
      mode === "source"
        ? "source-authenticated-large-read-proof"
        : "installed-authenticated-large-read-proof",
    ...facts,
    fullPayloadDownloads: profile === "full" ? 2 : 0,
    cancellationCases: cases,
    finalAcknowledgementRequiredAfterFullReceipt: profile === "full",
    cancellationRetractsReceivedBytes: false,
    connectionBoundTickets: profile === "full",
    unchangedRpcFraming: true,
    chunkLimitBytes: STAGE_CHUNK_BYTES,
    sharedResidentCeiling: STAGE_BUDGET_BYTES,
    writerProgressWhileConsumerPaused: true,
    creditsReleased: true,
    consumerProcessesJoined: true,
    durableMainFileRestore: true,
    readMaterialization: "adopted-sdk-backing",
    restoreVerification: "adopted-read-fixed-digest",
    sdkPeakAllocationBoundEstablished: false,
    controlClientProcess:
      profile === "full" ? "harness-and-separate-process" : "separate-process",
    separateProcessControl: processControl,
    separateControlLocalOpenFenced: true,
    separateControlPayloadActor: true,
    separateControlRpcWhileConsumerHeld: true,
    applicationRuntimeBooted: false,
    hardKilledControlRecovery: false,
    hardKilledConsumerJoined: true,
    controlReusableAfterConsumerKill: true,
    authenticatedUpload: false,
    activeScanFaults: false,
    packaged: mode === "installed",
    controlAndConsumerRuntime: "external-bun",
    runtimeReplaced: false,
    imageProcessing: false,
    rssBoundEstablished: false,
  };
} catch (error) {
  errors.push(error);
}
for (const control of clients) control.close();
const cleanup = await Promise.allSettled([
  broker.close(),
  server.close(),
  ...remotes.map((remote) => remote.close()),
  ...[...controlProcesses].map((control) => control.stop()),
]);
for (const result of cleanup)
  if (result.status === "rejected" && !errors.includes(result.reason))
    errors.push(result.reason);
await Promise.allSettled(downloads); // Expected cancellation failures were observed by each scenario; this joins remaining work.
let nativeClosed = true;
for (const owner of [restored, driver]) {
  if (!owner) continue;
  try {
    await owner.close();
  } catch (error) {
    nativeClosed = false;
    errors.push(
      new Error(`Native close unconfirmed; retained ${directory}`, {
        cause: error,
      }),
    );
  }
}
if (nativeClosed) {
  try {
    await rm(directory, { recursive: true, force: true });
  } catch (error) {
    errors.push(error);
  }
}
if (errors.length === 1) throw errors[0];
if (errors.length > 1)
  throw new AggregateError(
    errors,
    "Authenticated large read and cleanup failed",
    { cause: errors.at(-1) },
  );
assert(report);
console.log(JSON.stringify(report));
