// Source-only boundary proof using the real authenticated local-database RPC.
// Uses its existing connectionSignal hook; does not wire runtime asset transfers.
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import {
  networkEndpointSchema,
  type NetworkEndpoint,
  NETWORK_SCRATCH_BYTES,
} from "../shared/db/test/fixtures/turso-thread/network-wire";
import { Worker } from "node:worker_threads";
import { z } from "@brains/utils/zod";
import {
  LocalDatabaseRpcClient,
  LocalDatabaseRpcServer,
} from "../shell/core/src/local-database-endpoint";
import {
  TursoThreadProof,
  type ProofTransaction,
} from "../shared/db/test/fixtures/turso-thread/client";
import type { TransactionMode } from "@libsql/client";
import type { StageClaim } from "../shared/db/test/fixtures/turso-thread/binary-protocol";
import { ProofBudgetPool } from "../shared/db/test/fixtures/turso-thread/budget-pool";
import {
  ScopedUploads,
  uploadSizeSchema,
  uploadTicketSchema,
  uploadOfferSchema as ticketResult,
  uploadReceiptSchema as receiptResult,
} from "../shared/db/test/fixtures/turso-thread/scoped-uploads";
import {
  errorSchema,
  serializeError,
  deserializeError,
} from "../shared/db/src/turso-worker/error-protocol";

const workerUrl = new URL(
  "../shared/db/test/fixtures/turso-thread/worker.ts",
  import.meta.url,
);
const producerUrl = new URL(
  "../shared/db/test/fixtures/turso-thread/upload-producer.ts",
  import.meta.url,
);
const networkWorkerUrl = new URL(
  "../shared/db/test/fixtures/turso-thread/network-ingress-worker.ts",
  import.meta.url,
);
const networkProducerUrl = new URL(
  "../shared/db/test/fixtures/turso-thread/network-producer.ts",
  import.meta.url,
);
const requestSchema = z.discriminatedUnion("operation", [
  z.strictObject({
    operation: z.literal("endpoint"),
    ticket: uploadTicketSchema,
  }),
  z.strictObject({ operation: z.literal("identify") }),
  z.strictObject({ operation: z.literal("offer"), size: uploadSizeSchema }),
  z.strictObject({
    operation: z.literal("upload"),
    ticket: uploadTicketSchema,
  }),
  z.strictObject({
    operation: z.literal("cancel"),
    ticket: uploadTicketSchema,
  }),
  z.strictObject({
    operation: z.literal("publish"),
    ticket: uploadTicketSchema,
    key: z.string().min(1).max(64),
    fail: z.boolean().default(false),
  }),
]);
const responseSchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), value: z.unknown() }),
  z.strictObject({ ok: z.literal(false), error: errorSchema }),
]);
async function call(
  client: LocalDatabaseRpcClient,
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const reply = responseSchema.parse(
    await client.request("upload-proof", input, { signal }),
  );
  if (!reply.ok) throw deserializeError(reply.error);
  return reply.value;
}
class ObservedDriver extends TursoThreadProof {
  public transactionSubmissions = 0;
  public claimSubmitted: () => void = () => undefined;
  public override transaction(
    mode: TransactionMode = "write",
    claims: StageClaim[] = [],
  ): Promise<ProofTransaction> {
    this.transactionSubmissions++;
    const pending = super.transaction(mode, claims);
    if (claims.length > 0) this.claimSubmitted();
    return pending;
  }
}
interface Fixture {
  directory: string;
  path: string;
  driver: ObservedDriver;
  pool: ProofBudgetPool;
  server: LocalDatabaseRpcServer;
  broker: ScopedUploads;
  clients: LocalDatabaseRpcClient[];
  spawn: (size: number) => Worker;
  beforeCommit: () => Promise<void>;
  afterResult: (operation: string) => Promise<void>;
  closeBroker: () => Promise<void>;
  calls: number;
  network: boolean;
  networkStarted: () => void;
  remote: Set<{ stop: () => Promise<void> }>;
  client: (secret?: string) => LocalDatabaseRpcClient;
  connection: (client: LocalDatabaseRpcClient) => Promise<AbortSignal>;
}
let fixture: Fixture;
beforeEach(async () => {
  const directory = await mkdtemp(join(tmpdir(), "brains-scoped-upload-"));
  const path = join(directory, "source.db");
  const pool = new ProofBudgetPool();
  const driver = new ObservedDriver({
    url: pathToFileURL(path).href,
    workerUrl,
    budget: pool,
  });
  await driver.executeMultiple(
    "CREATE TABLE scoped_payloads (id TEXT PRIMARY KEY, bytes BLOB NOT NULL); CREATE TABLE scoped_refs (id TEXT PRIMARY KEY REFERENCES scoped_payloads(id)); CREATE TABLE scoped_effects (id TEXT PRIMARY KEY REFERENCES scoped_payloads(id));",
  );
  const config = {
    address: join(directory, "owner.sock"),
    secret: randomUUID() + randomUUID(),
    sessionId: "owner",
  };
  const server = new LocalDatabaseRpcServer({ config });
  const broker = new ScopedUploads(driver, (size) => fixture.spawn(size));
  const identities = new Map<string, AbortSignal>();
  const ids = new WeakMap<AbortSignal, string>();
  const endpoints = new Map<
    string,
    { connection: AbortSignal; ready: Promise<NetworkEndpoint> }
  >();
  fixture = {
    directory,
    path,
    driver,
    pool,
    server,
    broker,
    clients: [],
    calls: 0,
    network: false,
    remote: new Set(),
    networkStarted: (): void => undefined,
    spawn: (size): Worker => new Worker(producerUrl, { workerData: { size } }),
    beforeCommit: (): Promise<void> => Promise.resolve(),
    afterResult: (): Promise<void> => Promise.resolve(),
    closeBroker: (): Promise<void> => broker.close(),
    client: (secret): LocalDatabaseRpcClient => {
      const client = new LocalDatabaseRpcClient({
        config: {
          ...config,
          secret: secret ?? config.secret,
          sessionId: "same-client-session",
        },
      });
      fixture.clients.push(client);
      return client;
    },
    connection: async (client): Promise<AbortSignal> => {
      const id = z
        .string()
        .uuid()
        .parse(await call(client, { operation: "identify" }));
      const signal = identities.get(id);
      assert(signal);
      return signal;
    },
  };
  server.register("upload-proof", async (input, context): Promise<unknown> => {
    fixture.calls++;
    try {
      const request = requestSchema.parse(input);
      let value: unknown;
      switch (request.operation) {
        case "identify": {
          const id = ids.get(context.connectionSignal) ?? randomUUID();
          ids.set(context.connectionSignal, id);
          identities.set(id, context.connectionSignal);
          value = id;
          break;
        }
        case "offer":
          value = await broker.offer(context, request.size);
          break;
        case "upload":
          value = await broker.upload(
            context,
            request.ticket,
            fixture.network
              ? (): Worker => {
                  // Factory is reached only after socket authority and ingress admission.
                  const ready = Promise.withResolvers<NetworkEndpoint>();
                  void ready.promise.catch(() => undefined); // Observed by endpoint lookup; worker failures also reject upload.
                  const peer = pool.networkIngress.spawn(
                    () => new Worker(networkWorkerUrl),
                  );
                  endpoints.set(request.ticket, {
                    connection: context.connectionSignal,
                    ready: ready.promise,
                  });
                  peer.once("message", (input: unknown) => {
                    try {
                      const message = z
                        .strictObject({
                          kind: z.literal("network-listening"),
                          endpoint: networkEndpointSchema,
                          pid: z.literal(process.pid),
                          threadId: z.number().int().positive(),
                        })
                        .parse(input);
                      assert.equal(message.threadId, peer.threadId);
                      ready.resolve(message.endpoint);
                    } catch (error) {
                      ready.reject(error);
                      throw error;
                    }
                  });
                  peer.once("error", (error) => ready.reject(error));
                  peer.once("exit", () => {
                    endpoints.delete(request.ticket);
                    ready.reject(
                      new Error(
                        "Network bridge exited before endpoint delivery",
                      ),
                    );
                  });
                  fixture.networkStarted();
                  return peer;
                }
              : undefined,
          );
          break;
        case "endpoint": {
          const endpoint = endpoints.get(request.ticket);
          if (endpoint?.connection !== context.connectionSignal)
            throw new Error("Unknown or foreign network endpoint ticket");
          endpoints.delete(request.ticket); // One retrieval; never consume another socket's entry.
          value = await endpoint.ready;
          if (context.connectionSignal.aborted || context.signal.aborted)
            throw new Error("Network endpoint scope revoked");
          break;
        }
        case "cancel":
          await broker.cancel(context, request.ticket);
          value = null;
          break;
        case "publish":
          value = await broker.consume(
            context,
            request.ticket,
            async (tx, claim) => {
              await tx.executeBound({
                sql: "INSERT INTO scoped_payloads VALUES (?, ?)",
                args: [
                  { kind: "scalar", value: request.key },
                  { kind: "resident", claim },
                ],
              });
              await tx.execute({
                sql: "INSERT INTO scoped_refs VALUES (?)",
                args: [request.key],
              });
              await tx.execute({
                sql: "INSERT INTO scoped_effects VALUES (?)",
                args: [request.key],
              });
              await fixture.beforeCommit();
              if (request.fail)
                throw new Error("Injected scoped mutation failure");
              return { published: request.key };
            },
          );
      }
      await fixture.afterResult(request.operation);
      return { ok: true, value };
    } catch (error) {
      // The current RPC transport flattens thrown errors. Keep the bounded proof
      // graph in a validated value envelope instead of changing runtime framing.
      return { ok: false, error: serializeError(error) };
    }
  });
  await server.initialize();
});
afterEach(async () => {
  for (const client of fixture.clients) client.close();
  const results = await Promise.allSettled([
    fixture.closeBroker(),
    fixture.server.close(),
    ...[...fixture.remote].map((peer) => peer.stop()),
  ]);
  const errors: unknown[] = [];
  for (const result of results)
    if (result.status === "rejected") errors.push(result.reason);
  try {
    await fixture.driver.close();
  } catch (error) {
    errors.push(error);
  }
  await rm(fixture.directory, { recursive: true, force: true });
  if (errors.length > 0)
    throw new AggregateError(errors, "Upload scope fixture cleanup failed");
});
async function offer(
  client: LocalDatabaseRpcClient,
  size = 3,
): Promise<string> {
  return ticketResult.parse(await call(client, { operation: "offer", size }))
    .ticket;
}
async function upload(
  client: LocalDatabaseRpcClient,
  ticket: string,
): Promise<z.output<typeof receiptResult>> {
  return receiptResult.parse(
    await call(client, { operation: "upload", ticket }),
  );
}
function pauseProducer(): {
  ready: Promise<Worker>;
  resume: () => Promise<void>;
} {
  const ready = Promise.withResolvers<Worker>();
  fixture.spawn = (size): Worker => {
    const worker = new Worker(producerUrl, {
      workerData: { size, pause: true },
    });
    const onError = (error: Error): void => ready.reject(error);
    worker.once("error", onError);
    worker.once("message", (input: unknown) => {
      try {
        assert.deepEqual(input, {
          kind: "credit-held",
          threadId: worker.threadId,
          pid: process.pid,
        });
        worker.off("error", onError);
        ready.resolve(worker);
      } catch (error) {
        ready.reject(error);
      }
    });
    return worker;
  };
  return {
    ready: ready.promise,
    resume: async (): Promise<void> => {
      (await ready.promise).postMessage({ kind: "resume" });
    },
  };
}
function aborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}

describe("authenticated upload control scopes (source-only)", () => {
  it("hands off immutable owner receipts without imposing a transaction and retires an unused claim", async () => {
    const client = fixture.client();
    const receipt = await upload(client, await offer(client));
    const context = {
      connectionSignal: await fixture.connection(client),
      signal: new AbortController().signal,
    };
    const transactions = fixture.driver.transactionSubmissions;
    const digest = await fixture.broker.consumeClaim(
      context,
      receipt.ticket,
      async (_claim, facts) => {
        assert.deepEqual(facts, receipt);
        assert.equal(Object.isFrozen(facts), true);
        assert.throws(
          () => Object.assign(facts, { sizeBytes: 999 }),
          TypeError,
        );
        return facts.sha256;
      },
    );
    assert.equal(digest, receipt.sha256);
    assert.equal(fixture.driver.transactionSubmissions, transactions);
    assert.deepEqual(fixture.broker.stats(), { admissions: 0, tickets: 0 });
    assert.equal(fixture.pool.stats().residentBytes, 0);
    await assert.rejects(
      fixture.broker.consumeClaim(
        context,
        receipt.ticket,
        async () => undefined,
      ),
    );
  });
  it("retains a queued native claim across socket revocation before its transaction can begin", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const receipt = await upload(client, await offer(client));
    const blocker = await fixture.driver.transaction("write");
    const submitted = Promise.withResolvers<void>();
    fixture.driver.claimSubmitted = (): void => submitted.resolve();
    try {
      const rejected = assert.rejects(
        call(client, {
          operation: "publish",
          ticket: receipt.ticket,
          key: "queued",
        }),
      );
      await submitted.promise;
      // This later control command follows BEGIN on the same worker port. The
      // BEGIN pins the claim before waiting for the blocked native owner gate.
      assert.equal((await fixture.driver.stageStats()).attached, 1);
      const retired = fixture.broker.retirement(connection);
      client.close();
      await aborted(connection);
      await fixture.broker.cleanupSettled();
      expect(fixture.pool.stats().residentBytes).toBe(3);
      assert.equal((await fixture.driver.stageStats()).attached, 1);
      await blocker.rollback();
      await retired;
      await rejected;
      const result = await fixture.driver.execute({
        sql: "SELECT hex(p.bytes) AS bytes FROM scoped_payloads p JOIN scoped_refs r ON r.id=p.id JOIN scoped_effects e ON e.id=p.id WHERE p.id='queued'",
      });
      assert.equal(result.rows[0]?.["bytes"], "5A5A5A");
      assert.equal(fixture.pool.stats().residentBytes, 0);
    } finally {
      await blocker.rollback();
    }
  });
  it("fences tickets and retains an unconfirmed scope when the cleanup lane itself is exhausted", async () => {
    const client = fixture.client();
    const ticket = await offer(client);
    const first = await fixture.driver.openBinaryScope();
    const second = await fixture.driver.openBinaryScope();
    const gate = new SharedArrayBuffer(4);
    const blocked = fixture.driver.holdThreadForProof(gate);
    await blocked.entered;
    const closing = [first.close(), second.close()];
    try {
      await assert.rejects(
        call(client, { operation: "cancel", ticket }),
        /overloaded/,
      );
      await assert.rejects(offer(client), /fenced/);
      expect(fixture.broker.stats()).toEqual({ admissions: 1, tickets: 0 });
      assert.equal(fixture.pool.stats().residentBytes, 3);
      // Recheck the expected failure during teardown, rather than swallowing it.
      fixture.closeBroker = async (): Promise<void> => {
        await assert.rejects(
          fixture.broker.close(),
          /Scoped upload cleanup could not be confirmed/,
        );
      };
      await fixture.closeBroker();
    } finally {
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      await blocked.done;
      await Promise.all(closing);
    }
    assert.equal((await fixture.driver.stageStats()).stages, 1);
    await fixture.driver.close(); // Explicit owner shutdown, not retrying the failed cleanup.
    assert.equal(fixture.pool.stats().residentBytes, 0);
    assert.equal(fixture.broker.stats().admissions, 1); // No invented scope acknowledgement.
  });
  it.each(["offer", "upload"])(
    "revokes a cancelled %s result after broker completion but before RPC delivery",
    async (operation) => {
      const client = fixture.client();
      const connection = await fixture.connection(client);
      const ticket = operation === "upload" ? await offer(client) : undefined;
      const entered = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      fixture.afterResult = async (current): Promise<void> => {
        if (current === operation) {
          entered.resolve();
          await release.promise;
        }
      };
      const controller = new AbortController();
      try {
        const rejected = assert.rejects(
          call(
            client,
            operation === "upload"
              ? { operation, ticket }
              : { operation, size: 3 },
            controller.signal,
          ),
        );
        await entered.promise;
        assert.equal(fixture.pool.stats().residentBytes, 3);
        controller.abort();
        await rejected;
        await fixture.connection(client); // Ordered after the actual cancel frame.
        await fixture.broker.cleanupSettled();
        expect(fixture.broker.stats()).toEqual({ admissions: 0, tickets: 0 });
        assert.equal(fixture.pool.stats().residentBytes, 0);
        assert.equal(connection.aborted, false);
      } finally {
        controller.abort();
        release.resolve();
      }
    },
  );
  it("bounds idle tickets and serializes disconnect cleanup without overflowing its reserved lane", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    for (let index = 0; index < 16; index++) await offer(client, 0);
    await assert.rejects(offer(client, 0), /admission capacity/);
    expect(fixture.broker.stats()).toEqual({ admissions: 16, tickets: 16 });
    assert.equal(fixture.pool.stats().residentSlots, 16);
    const retired = fixture.broker.retirement(connection);
    client.close();
    await retired;
    assert.equal(fixture.broker.stats().admissions, 0);
    assert.equal(fixture.pool.stats().residentSlots, 0);
    assert.equal((await fixture.driver.stageStats()).scopes, 0);
  });
  it("receives authenticated cancellation during native saturation but retains credit until cleanup is acknowledged", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const ticket = await offer(client);
    const producer = pauseProducer();
    const controller = new AbortController();
    const rejected = assert.rejects(
      call(client, { operation: "upload", ticket }, controller.signal),
    );
    const source = await producer.ready;
    const exited = new Promise<void>((resolve) =>
      source.once("exit", () => resolve()),
    );
    const retired = fixture.broker.retirement(connection);
    const gate = new SharedArrayBuffer(4);
    const blocked = fixture.driver.holdThreadForProof(gate);
    try {
      await blocked.entered;
      const queued = Array.from({ length: 15 }, () =>
        fixture.driver.execute({ sql: "SELECT 1" }),
      );
      await assert.rejects(
        fixture.driver.execute({ sql: "SELECT 2" }),
        /overloaded/,
      );
      controller.abort();
      await rejected;
      await exited;
      assert.equal(await fixture.connection(client), connection);
      expect(fixture.pool.stats().residentBytes).toBe(3);
      assert.equal(fixture.pool.ingress.stats().slots, 1);
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      await blocked.done;
      await Promise.all(queued);
      await retired;
      assert.equal(fixture.pool.stats().residentBytes, 0);
      assert.equal(fixture.pool.ingress.stats().slots, 0);
    } finally {
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      controller.abort();
    }
  });
  it("returns native SQL diagnostics through the authenticated envelope without replay or a second publication", async () => {
    const client = fixture.client();
    const first = await upload(client, await offer(client));
    await call(client, {
      operation: "publish",
      ticket: first.ticket,
      key: "duplicate",
    });
    const second = await upload(client, await offer(client));
    await assert.rejects(
      call(client, {
        operation: "publish",
        ticket: second.ticket,
        key: "duplicate",
      }),
      (error) => {
        assert(error instanceof Error);
        assert.match(error.message, /UNIQUE constraint failed/);
        return true;
      },
    );
    await assert.rejects(
      call(client, {
        operation: "publish",
        ticket: second.ticket,
        key: "retry",
      }),
      /Unknown/,
    );
    const result = await fixture.driver.execute({
      sql: "SELECT (SELECT count(*) FROM scoped_payloads) AS payloads, (SELECT count(*) FROM scoped_refs) AS refs, (SELECT count(*) FROM scoped_effects) AS effects",
    });
    expect([
      result.rows[0]?.["payloads"],
      result.rows[0]?.["refs"],
      result.rows[0]?.["effects"],
    ]).toEqual([1, 1, 1]);
    assert.equal(fixture.pool.stats().residentBytes, 0);
    assert.equal(fixture.broker.stats().admissions, 0);
  });
  it("rejects bad authentication before allocating and binds tickets to sockets, not session strings", async () => {
    const bad = fixture.client("x".repeat(72));
    await assert.rejects(bad.initialize());
    expect(fixture.calls).toBe(0);
    assert.equal(fixture.broker.stats().admissions, 0);
    const first = fixture.client();
    const second = fixture.client();
    const firstSignal = await fixture.connection(first);
    const secondSignal = await fixture.connection(second);
    assert.notEqual(firstSignal, secondSignal);
    const ticket = await offer(first);
    await assert.rejects(
      call(first, { operation: "publish", ticket, key: "unsealed" }),
      /different purpose/,
    );
    await assert.rejects(upload(second, ticket), /foreign upload ticket/);
    await assert.rejects(
      call(second, { operation: "cancel", ticket }),
      /foreign upload ticket/,
    );
    assert.equal(fixture.pool.stats().residentBytes, 3);
    const receipt = await upload(first, ticket);
    await assert.rejects(upload(first, receipt.ticket), /different purpose/);
    await assert.rejects(upload(first, ticket), /Unknown/);
    await assert.rejects(
      call(first, { operation: "publish", ticket, key: "wrong-purpose" }),
      /Unknown/,
    );
    await assert.rejects(
      call(second, {
        operation: "publish",
        ticket: receipt.ticket,
        key: "foreign",
      }),
      /foreign/,
    );
    await call(first, { operation: "cancel", ticket: receipt.ticket });
    assert.equal(fixture.broker.stats().admissions, 0);
  });
  it("revokes idle offers and receipts on disconnect and refuses them on a same-session reconnect", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const unused = await offer(client);
    const receipt = await upload(client, await offer(client));
    const retired = fixture.broker.retirement(connection);
    client.close();
    await retired;
    expect(fixture.broker.stats()).toEqual({ admissions: 0, tickets: 0 });
    assert.equal(fixture.pool.stats().residentBytes, 0);
    const reconnected = fixture.client();
    assert.notEqual(await fixture.connection(reconnected), connection);
    await assert.rejects(upload(reconnected, unused), /Unknown/);
    await assert.rejects(
      call(reconnected, {
        operation: "publish",
        ticket: receipt.ticket,
        key: "stale",
      }),
      /Unknown/,
    );
  });
  it("disconnects an active credited producer and joins it before retiring the admission", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const ticket = await offer(client);
    const producer = pauseProducer();
    const rejected = assert.rejects(upload(client, ticket));
    const source = await producer.ready;
    await assert.rejects(upload(client, ticket), /Unknown/);
    const exited = new Promise<void>((resolve) =>
      source.once("exit", () => resolve()),
    );
    const retired = fixture.broker.retirement(connection);
    client.close();
    await retired;
    await rejected;
    await exited;
    expect(fixture.pool.ingress.stats().slots).toBe(0);
    assert.equal(fixture.pool.stats().residentBytes, 0);
    assert.equal(fixture.broker.stats().admissions, 0);
  });
  it("cancels one running RPC without revoking a sibling offer on the same connection", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const ticket = await offer(client);
    const sibling = await offer(client);
    const producer = pauseProducer();
    const controller = new AbortController();
    const rejected = assert.rejects(
      call(client, { operation: "upload", ticket }, controller.signal),
    );
    await producer.ready;
    const cleanup = fixture.broker.retirement(connection); // Includes the sibling until explicitly cancelled below.
    controller.abort();
    await rejected;
    // This request/response is ordered after the cancel frame on the same socket.
    await fixture.connection(client);
    await fixture.broker.cleanupSettled();
    fixture.spawn = (size): Worker =>
      new Worker(producerUrl, { workerData: { size } });
    const receipt = await upload(client, sibling);
    expect(connection.aborted).toBe(false);
    await call(client, { operation: "cancel", ticket: receipt.ticket });
    await cleanup;
    assert.equal(fixture.broker.stats().admissions, 0);
    assert.equal(fixture.pool.ingress.stats().slots, 0);
  });
  it("commits an admitted BLOB/reference/effect transaction after disconnect and restores its main file", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const receipt = await upload(client, await offer(client));
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    fixture.beforeCommit = async (): Promise<void> => {
      entered.resolve();
      await release.promise;
    };
    try {
      const rejected = assert.rejects(
        call(client, {
          operation: "publish",
          ticket: receipt.ticket,
          key: "committed",
        }),
      );
      await entered.promise;
      await assert.rejects(
        call(client, {
          operation: "publish",
          ticket: receipt.ticket,
          key: "duplicate-running",
        }),
        /Unknown/,
      );
      const retired = fixture.broker.retirement(connection);
      client.close();
      await aborted(connection);
      await fixture.broker.cleanupSettled();
      expect((await fixture.driver.stageStats()).attached).toBe(1);
      assert.equal(fixture.pool.stats().residentBytes, 3);
      release.resolve();
      await retired;
      await rejected;
      assert.equal(fixture.pool.stats().residentBytes, 0);
    } finally {
      release.resolve();
    }
    await fixture.driver.close();
    const restoredPath = join(fixture.directory, "restored.db");
    await copyFile(fixture.path, restoredPath);
    const restored = new TursoThreadProof({
      url: pathToFileURL(restoredPath).href,
      workerUrl,
    });
    try {
      const result = await restored.execute({
        sql: "SELECT hex(p.bytes) AS bytes FROM scoped_payloads p JOIN scoped_refs r ON r.id=p.id JOIN scoped_effects e ON e.id=p.id WHERE p.id='committed'",
      });
      assert.equal(result.rows[0]?.["bytes"], "5A5A5A");
    } finally {
      await restored.close();
    }
  });
  it("rolls back a body failure atomically and does not reissue its spent receipt", async () => {
    const client = fixture.client();
    const receipt = await upload(client, await offer(client));
    await assert.rejects(
      call(client, {
        operation: "publish",
        ticket: receipt.ticket,
        key: "rolled-back",
        fail: true,
      }),
      /Injected scoped mutation failure/,
    );
    await assert.rejects(
      call(client, {
        operation: "publish",
        ticket: receipt.ticket,
        key: "replayed",
      }),
      /Unknown/,
    );
    const result = await fixture.driver.execute({
      sql: "SELECT (SELECT count(*) FROM scoped_payloads) + (SELECT count(*) FROM scoped_refs) + (SELECT count(*) FROM scoped_effects) AS n",
    });
    expect(result.rows[0]?.["n"]).toBe(0);
    assert.equal(fixture.broker.stats().admissions, 0);
    assert.equal(fixture.pool.stats().residentBytes, 0);
  });
});

const remoteMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("runtime"),
    pid: z.number().int().positive(),
    executable: z.string().max(4096),
    sidecarUrl: z.string().max(4096),
  }),
  z.strictObject({
    kind: z.literal("credit-held"),
    pid: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal("sealed"),
    pid: z.number().int().positive(),
    sizeBytes: uploadSizeSchema,
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.strictObject({
    kind: z.literal("failed"),
    pid: z.number().int().positive(),
    error: errorSchema,
  }),
]);
function remoteProducer(
  endpoint: NetworkEndpoint,
  size: number,
  options: { pause?: boolean; fragment?: boolean; fault?: string } = {},
): {
  held: Promise<void>;
  result: Promise<{ sizeBytes: number; sha256: string }>;
  exited: Promise<number>;
  stop: () => Promise<void>;
  resume: () => void;
} {
  const held = Promise.withResolvers<void>();
  const result = Promise.withResolvers<{ sizeBytes: number; sha256: string }>();
  void held.promise.catch(() => undefined); // Observed by paused cases; early process exit is also a result failure.
  void result.promise.catch(() => undefined); // Every caller awaits the result or explicitly joins cancellation.
  const child = Bun.spawn(
    [process.execPath, fileURLToPath(networkProducerUrl)],
    {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "inherit",
      ipc(input: unknown): void {
        const message = remoteMessageSchema.parse(input);
        assert.equal(message.pid, child.pid);
        assert.notEqual(message.pid, process.pid);
        if (message.kind === "runtime") {
          assert.equal(message.executable, process.execPath);
          assert.equal(message.sidecarUrl, networkProducerUrl.href);
        } else if (message.kind === "credit-held") held.resolve();
        else if (message.kind === "failed") {
          const error = deserializeError(message.error);
          held.reject(error);
          result.reject(error);
        } else
          result.resolve({
            sizeBytes: message.sizeBytes,
            sha256: message.sha256,
          });
      },
    },
  );
  void child.exited.then((code) => {
    held.reject(new Error(`Network producer exited (${code})`));
    result.reject(new Error(`Network producer exited without seal (${code})`));
  });
  const peer = {
    held: held.promise,
    result: result.promise,
    exited: child.exited,
    stop: async (): Promise<void> => {
      if (child.exitCode === null) child.kill();
      await child.exited;
    },
    resume: (): void => child.send({ kind: "resume" }),
  };
  fixture.remote.add(peer);
  child.send({ endpoint, size, ...options });
  return peer;
}
async function beginNetwork(
  client: LocalDatabaseRpcClient,
  size: number,
  signal?: AbortSignal,
): Promise<{
  ticket: string;
  completion: Promise<z.output<typeof receiptResult>>;
}> {
  fixture.network = true;
  const admitted = Promise.withResolvers<void>();
  fixture.networkStarted = (): void => admitted.resolve();
  const ticket = await offer(client, size);
  const completion = call(client, { operation: "upload", ticket }, signal).then(
    (value) => receiptResult.parse(value),
  );
  // The test rendezvous observes factory admission, not payload traffic or time.
  await Promise.race([
    admitted.promise,
    completion.then(() => {
      throw new Error("Upload finished without endpoint admission");
    }),
  ]);
  return { ticket, completion };
}
async function networkEndpoint(
  client: LocalDatabaseRpcClient,
  ticket: string,
): Promise<NetworkEndpoint> {
  return networkEndpointSchema.parse(
    await call(client, { operation: "endpoint", ticket }),
  );
}
describe("authenticated cross-process raw ingress (source proof)", () => {
  it("bounds live TCP bridges before a third factory and retires both on control disconnect", async () => {
    const clients = [fixture.client(), fixture.client()];
    const connections = await Promise.all(
      clients.map((client) => fixture.connection(client)),
    );
    const transfers: { completion: Promise<z.output<typeof receiptResult>> }[] =
      [];
    for (const client of clients) {
      const transfer = await beginNetwork(client, 65539);
      transfers.push(transfer);
      const producer = remoteProducer(
        await networkEndpoint(client, transfer.ticket),
        65539,
        { pause: true },
      );
      await producer.held;
    }
    expect(fixture.pool.networkIngress.stats()).toEqual({
      slots: 2,
      reservedBytes: 2 * NETWORK_SCRATCH_BYTES,
    });
    await assert.rejects(
      beginNetwork(fixture.client(), 3),
      /Shared ingress capacity exceeded/,
    );
    assert.equal(fixture.broker.stats().admissions, 2);
    const rejected = transfers.map((transfer) =>
      assert.rejects(transfer.completion),
    );
    for (const client of clients) client.close();
    await Promise.all(rejected);
    await Promise.all(
      connections.map((connection) => fixture.broker.retirement(connection)),
    );
    assert.equal(fixture.pool.networkIngress.stats().slots, 0);
    assert.equal(fixture.pool.ingress.stats().slots, 0);
  });
  it("revokes an unused listener and refuses its old bearer on a fresh stage", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const first = await beginNetwork(client, 3);
    const rejected = assert.rejects(first.completion);
    const old = await networkEndpoint(client, first.ticket);
    client.close();
    await rejected;
    await fixture.broker.retirement(connection);
    expect(fixture.pool.networkIngress.stats().slots).toBe(0);
    const other = fixture.client();
    const second = await beginNetwork(other, 3);
    const invalid = assert.rejects(second.completion);
    const endpoint = await networkEndpoint(other, second.ticket);
    assert.notEqual(endpoint.token, old.token);
    const producer = remoteProducer({ ...endpoint, token: old.token }, 3);
    await assert.rejects(producer.result);
    assert.notEqual(await producer.exited, 0);
    await invalid;
    assert.equal(fixture.pool.networkIngress.stats().slots, 0);
  });
  it.each([0, 65539])(
    "moves %i bytes without parent payloads and atomically publishes the sealed receipt",
    async (size) => {
      const client = fixture.client();
      const other = fixture.client();
      const transfer = await beginNetwork(client, size);
      await assert.rejects(networkEndpoint(other, transfer.ticket), /foreign/);
      const endpoint = await networkEndpoint(client, transfer.ticket);
      await assert.rejects(networkEndpoint(client, transfer.ticket), /Unknown/);
      await assert.rejects(upload(client, transfer.ticket), /Unknown/);
      const producer = remoteProducer(endpoint, size, { fragment: true });
      const facts = await producer.result;
      assert.equal(await producer.exited, 0);
      const receipt = await transfer.completion;
      expect(receipt.sizeBytes).toBe(size);
      assert.equal(receipt.sha256, facts.sha256);
      if (size === 65539)
        assert.equal(
          receipt.sha256,
          "82abcd7b965a2c75bef1461e9f5206f47621c1bdeda0aa75de8714ba73dabccc",
        );
      assert.equal(fixture.pool.ingress.stats().slots, 0);
      assert.equal(fixture.pool.networkIngress.stats().slots, 0);
      await call(client, {
        operation: "publish",
        ticket: receipt.ticket,
        key: "network",
      });
      const verified = await fixture.driver.verifyBlob({
        table: "scoped_payloads",
        column: "bytes",
        key: [{ column: "id", value: "network" }],
        maxBytes: size,
      });
      assert.deepEqual(verified, facts);
      await fixture.driver.close();
      const restoredPath = join(fixture.directory, "network-restored.db");
      await copyFile(fixture.path, restoredPath);
      const restored = new TursoThreadProof({
        url: pathToFileURL(restoredPath).href,
        workerUrl,
      });
      try {
        assert.deepEqual(
          await restored.verifyBlob({
            table: "scoped_payloads",
            column: "bytes",
            key: [{ column: "id", value: "network" }],
            maxBytes: size,
          }),
          facts,
        );
        assert.equal(
          (
            await restored.execute({
              sql: "SELECT count(*) AS n FROM scoped_payloads JOIN scoped_refs USING(id) JOIN scoped_effects USING(id)",
            })
          ).rows[0]?.["n"],
          1,
        );
      } finally {
        await restored.close();
      }
    },
  );
  it.each([
    "token",
    "sequence",
    "credit",
    "oversize",
    "truncated",
    "disconnect",
  ])(
    "rejects %s without publication or leaked server credits",
    async (fault) => {
      const client = fixture.client();
      const transfer = await beginNetwork(client, 3);
      const rejected = assert.rejects(transfer.completion);
      const endpoint = await networkEndpoint(client, transfer.ticket);
      const producer = remoteProducer(endpoint, 3, { fault });
      await assert.rejects(producer.result);
      assert.notEqual(await producer.exited, 0);
      await rejected;
      await fixture.broker.cleanupSettled();
      expect(fixture.pool.stats().residentBytes).toBe(0);
      assert.equal(fixture.pool.ingress.stats().slots, 0);
      assert.equal(fixture.pool.networkIngress.stats().slots, 0);
      assert.equal(
        (
          await fixture.driver.execute({
            sql: "SELECT count(*) AS n FROM scoped_payloads",
          })
        ).rows[0]?.["n"],
        0,
      );
    },
  );
  it.each(["cancel", "disconnect"])(
    "revokes an admitted raw stream on authenticated control %s",
    async (mode) => {
      const client = fixture.client();
      const connection = await fixture.connection(client);
      const cancellation = new AbortController();
      const transfer = await beginNetwork(client, 65539, cancellation.signal);
      const rejected = assert.rejects(transfer.completion);
      const producer = remoteProducer(
        await networkEndpoint(client, transfer.ticket),
        65539,
        { pause: true },
      );
      await producer.held;
      expect(fixture.pool.networkIngress.stats().reservedBytes).toBe(
        NETWORK_SCRATCH_BYTES,
      );
      assert.equal(
        (await fixture.driver.execute({ sql: "SELECT 1 AS n" })).rows[0]?.["n"],
        1,
      );
      if (mode === "cancel") cancellation.abort();
      else client.close();
      await rejected;
      await fixture.broker.retirement(connection);
      assert.equal(fixture.pool.stats().residentBytes, 0);
      assert.equal(fixture.pool.ingress.stats().slots, 0);
      assert.equal(fixture.pool.networkIngress.stats().slots, 0);
      // The remote process owns its own copy; the owner only joins its server bridge.
      await producer.stop();
    },
  );
});
