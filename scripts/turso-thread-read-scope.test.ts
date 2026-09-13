// Source-only authenticated read/control + cross-process data proof. Depends on
// the preserved connectionSignal hook; no runtime reader or policy is replaced.
import { beforeEach, afterEach, describe, it, expect } from "bun:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "@brains/utils/zod";
import {
  LocalDatabaseRpcServer,
  LocalDatabaseRpcClient,
} from "../shell/core/src/local-database-endpoint";
import { SqlWorkerDriver } from "../shared/db/src/turso-worker/client";
import type { ReadCommand } from "../shared/db/src/turso-worker/read-protocol";
import { PersistenceBudgetPool } from "../shared/db/src/turso-worker/budget-pool";
import { ScopedReads } from "../shared/db/src/turso-worker/scoped-reads";
import {
  readOfferSchema,
  readEndpointSchema,
  readPausedSchema,
  type ReadOffer,
} from "../shared/db/src/turso-worker/network-read-protocol";
import {
  blobFactsSchema,
  type BlobFacts,
} from "../shared/db/src/turso-worker/blob-protocol";
import { NETWORK_SCRATCH_BYTES } from "../shared/db/src/turso-worker/network-wire";
import { STAGE_CHUNK_BYTES } from "../shared/db/src/turso-worker/binary-protocol";
import {
  errorSchema,
  serializeError,
  deserializeError,
} from "../shared/db/src/turso-worker/error-protocol";

const workerUrl = new URL(
  "../shared/db/src/turso-worker/worker.ts",
  import.meta.url,
);
const bridgeUrl = new URL(
  "../shared/db/src/turso-worker/network-read-worker.ts",
  import.meta.url,
);
const consumerUrl = new URL(
  "../shared/db/test/fixtures/turso-thread/network-read-consumer.ts",
  import.meta.url,
);
const SHA = "d4f9bcbd9be765d114b85ab79d16c218fb5c1e03315f689603d48eed00bff97f";
const inputSchema = z.discriminatedUnion("operation", [
  z.strictObject({ operation: z.literal("identify") }),
  z.strictObject({
    operation: z.literal("offer"),
    id: z.enum(["public", "empty", "private"]),
  }),
  z.strictObject({
    operation: z.literal("download"),
    ticket: z.string().uuid(),
  }),
  z.strictObject({
    operation: z.literal("endpoint"),
    ticket: z.string().uuid(),
  }),
  z.strictObject({ operation: z.literal("cancel"), ticket: z.string().uuid() }),
]);
const replySchema = z.discriminatedUnion("ok", [
  z.strictObject({ ok: z.literal(true), value: z.unknown() }),
  z.strictObject({ ok: z.literal(false), error: errorSchema }),
]);
async function call(
  client: LocalDatabaseRpcClient,
  input: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const reply = replySchema.parse(
    await client.request("read-proof", input, { signal }),
  );
  if (!reply.ok) throw deserializeError(reply.error);
  return reply.value;
}
class ObservedDriver extends SqlWorkerDriver {
  public fillSubmitted: () => void = () => undefined;
  public override read(command: ReadCommand): Promise<unknown> {
    const pending = super.read(command);
    if (command.action === "fill") this.fillSubmitted();
    return pending;
  }
}
interface Fixture {
  directory: string;
  path: string;
  driver: ObservedDriver;
  pool: PersistenceBudgetPool;
  broker: ScopedReads;
  server: LocalDatabaseRpcServer;
  clients: LocalDatabaseRpcClient[];
  children: Set<{ stop: () => Promise<void> }>;
  spawned: number;
  admitted: () => void;
  cancelled: () => void;
  afterResult: (operation: string) => Promise<void>;
  closeBroker: () => Promise<void>;
  client: (secret?: string) => LocalDatabaseRpcClient;
  connection: (client: LocalDatabaseRpcClient) => Promise<AbortSignal>;
}
let fixture: Fixture;
beforeEach(async () => {
  const directory = await mkdtemp(join(tmpdir(), "turso-read-scope-"));
  const path = join(directory, "source.db");
  const pool = new PersistenceBudgetPool();
  const driver = new ObservedDriver({
    url: pathToFileURL(path).href,
    workerUrl,
    budget: pool,
  });
  await driver.executeMultiple(
    "CREATE TABLE readable_payloads (id TEXT PRIMARY KEY, bytes BLOB NOT NULL); INSERT INTO readable_payloads VALUES ('public', zeroblob(65539)), ('empty', zeroblob(0)), ('private', x'FE')",
  );
  const config = {
    address: join(directory, "owner.sock"),
    secret: crypto.randomUUID() + crypto.randomUUID(),
    sessionId: "owner",
  };
  const server = new LocalDatabaseRpcServer({ config });
  const broker = new ScopedReads(driver);
  const identities = new Map<string, AbortSignal>();
  const names = new WeakMap<AbortSignal, string>();
  const endpoints = new Map<
    string,
    {
      connection: AbortSignal;
      ready: Promise<z.output<typeof readEndpointSchema>>;
    }
  >();
  fixture = {
    directory,
    path,
    driver,
    pool,
    broker,
    server,
    clients: [],
    children: new Set(),
    spawned: 0,
    admitted: (): void => undefined,
    cancelled: (): void => undefined,
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
  server.register("read-proof", async (input, context): Promise<unknown> => {
    try {
      const request = inputSchema.parse(input);
      let value: unknown;
      context.signal.addEventListener("abort", () => fixture.cancelled(), {
        once: true,
      });
      switch (request.operation) {
        case "identify": {
          const id = names.get(context.connectionSignal) ?? crypto.randomUUID();
          names.set(context.connectionSignal, id);
          identities.set(id, context.connectionSignal);
          value = id;
          break;
        }
        case "offer":
          // A server-owned allowlist, not an asserted production entity ACL.
          if (request.id === "private")
            throw new Error("Read target is not authorized");
          value = await broker.offer(context, {
            table: "readable_payloads",
            column: "bytes",
            key: [{ column: "id", value: request.id }],
            maxBytes: request.id === "empty" ? 0 : 65539,
          });
          break;
        case "download":
          value = await broker.download(context, request.ticket, () => {
            const ready =
              Promise.withResolvers<z.output<typeof readEndpointSchema>>();
            void ready.promise.catch(() => undefined); // Endpoint retrieval observes this; worker failure also rejects download.
            const peer = pool.networkEgress.spawn(() => new Worker(bridgeUrl));
            fixture.spawned++;
            endpoints.set(request.ticket, {
              connection: context.connectionSignal,
              ready: ready.promise,
            });
            peer.once("message", (input: unknown) => {
              const message = z
                .strictObject({
                  kind: z.literal("network-listening"),
                  endpoint: readEndpointSchema,
                  pid: z.literal(process.pid),
                  threadId: z.number().int().positive(),
                })
                .parse(input);
              assert.equal(message.threadId, peer.threadId);
              ready.resolve(message.endpoint);
            });
            peer.once("error", (error) => ready.reject(error));
            peer.once("exit", () => {
              endpoints.delete(request.ticket);
              ready.reject(
                new Error("Read bridge exited before endpoint delivery"),
              );
            });
            fixture.admitted();
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
            throw new Error("Read endpoint scope revoked");
          break;
        }
        case "cancel":
          await broker.cancel(context, request.ticket);
          value = null;
      }
      await fixture.afterResult(request.operation);
      return { ok: true, value };
    } catch (error) {
      return { ok: false, error: serializeError(error) };
    } // Preserve bounded diagnostics without changing runtime framing.
  });
  await server.initialize();
});
afterEach(async () => {
  for (const client of fixture.clients) client.close();
  const results = await Promise.allSettled([
    fixture.closeBroker(),
    fixture.server.close(),
    ...[...fixture.children].map((child) => child.stop()),
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
  if (errors.length)
    throw new AggregateError(errors, "Read scope fixture cleanup failed", {
      cause: errors[0],
    });
});
async function offer(
  client: LocalDatabaseRpcClient,
  id: "public" | "empty" = "public",
  signal?: AbortSignal,
): Promise<ReadOffer> {
  return readOfferSchema.parse(
    await call(client, { operation: "offer", id }, signal),
  );
}
async function begin(
  client: LocalDatabaseRpcClient,
  ticket: string,
  signal?: AbortSignal,
): Promise<PromiseBox> {
  const admitted = Promise.withResolvers<void>();
  fixture.admitted = (): void => admitted.resolve();
  const completion = call(
    client,
    { operation: "download", ticket },
    signal,
  ).then((value) => blobFactsSchema.parse(value));
  await Promise.race([
    admitted.promise,
    completion.then(() => {
      throw new Error("Read finished without bridge admission");
    }),
  ]);
  return { completion };
}
interface PromiseBox {
  completion: Promise<BlobFacts>;
}
async function endpoint(
  client: LocalDatabaseRpcClient,
  ticket: string,
): Promise<z.output<typeof readEndpointSchema>> {
  return readEndpointSchema.parse(
    await call(client, { operation: "endpoint", ticket }),
  );
}
const childMessageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("runtime"),
    pid: z.number().int().positive(),
    executable: z.string().max(4096),
    sidecarUrl: z.string().max(4096),
  }),
  readPausedSchema,
  blobFactsSchema.extend({
    kind: z.literal("consumed"),
    pid: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal("failed"),
    pid: z.number().int().positive(),
    error: errorSchema,
  }),
]);
function consumer(
  address: z.output<typeof readEndpointSchema>,
  facts: BlobFacts,
  options: { pause?: boolean; fault?: string } = {},
): {
  held: Promise<void>;
  result: Promise<BlobFacts>;
  exited: Promise<number>;
  resume: () => void;
  stop: () => Promise<void>;
} {
  const held = Promise.withResolvers<void>();
  const result = Promise.withResolvers<BlobFacts>();
  let identified = false;
  void held.promise.catch(() => undefined); // Failure also appears in result; only paused cases wait for held.
  void result.promise.catch(() => undefined); // Every case observes consumption or explicitly joins cancellation.
  const child = Bun.spawn([process.execPath, fileURLToPath(consumerUrl)], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
    ipc: (input: unknown): void => {
      const message = childMessageSchema.parse(input);
      assert.equal(message.pid, child.pid);
      assert.notEqual(message.pid, process.pid);
      if (message.kind === "runtime") {
        assert.equal(identified, false);
        identified = true;
        assert.equal(message.executable, process.execPath);
        assert.equal(message.sidecarUrl, consumerUrl.href);
      } else {
        assert(identified);
        if (message.kind === "chunk-held") {
          assert.equal(
            message.sizeBytes,
            Math.min(facts.sizeBytes, STAGE_CHUNK_BYTES),
          );
          if (message.sizeBytes === facts.sizeBytes)
            assert.equal(message.sha256, facts.sha256);
          held.resolve();
        } else if (message.kind === "failed") {
          const error = deserializeError(message.error);
          held.reject(error);
          result.reject(error);
        } else
          result.resolve({
            sizeBytes: message.sizeBytes,
            sha256: message.sha256,
          });
      }
    },
  });
  void child.exited.then((code) => {
    held.reject(new Error(`Read consumer exited (${code})`));
    result.reject(new Error(`Read consumer exited without result (${code})`));
  });
  const peer = {
    held: held.promise,
    result: result.promise,
    exited: child.exited,
    resume: (): void => child.send({ kind: "resume" }),
    stop: async (): Promise<void> => {
      if (child.exitCode === null) child.kill();
      await child.exited;
    },
  };
  fixture.children.add(peer);
  child.send({
    endpoint: address,
    facts: { sizeBytes: facts.sizeBytes, sha256: facts.sha256 },
    fragmentAck: true,
    ...options,
  });
  return peer;
}

describe("authenticated cross-process read scopes (source proof)", () => {
  it("retains unconfirmed read cleanup and fences authority when its cleanup lane is exhausted", async () => {
    const client = fixture.client();
    const read = await offer(client);
    const first = await fixture.driver.openReadScope();
    const second = await fixture.driver.openReadScope();
    const gate = new SharedArrayBuffer(4);
    const blocked = fixture.driver.holdThreadForProof(gate);
    await blocked.entered;
    const closing = [first.close(), second.close()];
    try {
      await assert.rejects(
        call(client, { operation: "cancel", ticket: read.ticket }),
        /overloaded/,
      );
      await assert.rejects(offer(client), /fenced/);
      expect(fixture.broker.stats()).toEqual({ admissions: 1, tickets: 0 });
      assert.equal(fixture.pool.stats().residentBytes, 65539);
      fixture.closeBroker = async (): Promise<void> => {
        await assert.rejects(
          fixture.broker.close(),
          /Scoped read cleanup could not be confirmed/,
        );
      };
      await fixture.closeBroker();
    } finally {
      Atomics.store(new Int32Array(gate), 0, 1);
      Atomics.notify(new Int32Array(gate), 0);
      await blocked.done;
      await Promise.all(closing);
    }
    assert.equal((await fixture.driver.readStats()).reads, 1);
    await fixture.driver.close(); // Explicit owner shutdown, not a manufactured scope acknowledgement.
    assert.equal(fixture.pool.stats().residentBytes, 0);
    assert.equal(fixture.broker.stats().admissions, 1);
  });
  it("admits two slow network readers and refuses a third before bridge construction", async () => {
    const clients = [fixture.client(), fixture.client()];
    const connections = await Promise.all(
      clients.map((client) => fixture.connection(client)),
    );
    const transfers: PromiseBox[] = [];
    for (const client of clients) {
      const read = await offer(client);
      const transfer = await begin(client, read.ticket);
      transfers.push(transfer);
      const remote = consumer(await endpoint(client, read.ticket), read, {
        pause: true,
      });
      await remote.held;
    }
    expect(fixture.pool.networkEgress.stats()).toEqual({
      slots: 2,
      reservedBytes: 2 * NETWORK_SCRATCH_BYTES,
    });
    assert.equal(fixture.pool.networkIngress.stats().slots, 0);
    assert.equal(fixture.pool.ingress.stats().slots, 0);
    const third = fixture.client();
    const offered = await offer(third);
    await assert.rejects(
      begin(third, offered.ticket),
      /Shared egress capacity exceeded/,
    );
    assert.equal(fixture.spawned, 2);
    assert.equal(fixture.broker.stats().admissions, 2);
    const rejected = transfers.map((transfer) =>
      assert.rejects(transfer.completion),
    );
    for (const client of clients) client.close();
    await Promise.all(rejected);
    await Promise.all(
      connections.map((connection) => fixture.broker.retirement(connection)),
    );
    assert.equal(fixture.pool.networkEgress.stats().slots, 0);
    assert.equal(fixture.pool.stats().residentBytes, 0);
  });
  it("revokes unused listeners and rejects their stale bearer on a different read", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const read = await offer(client);
    const first = await begin(client, read.ticket);
    const rejected = assert.rejects(first.completion);
    const stale = await endpoint(client, read.ticket);
    client.close();
    await rejected;
    await fixture.broker.retirement(connection);
    expect(fixture.pool.networkEgress.stats().slots).toBe(0);
    const other = fixture.client();
    const next = await offer(other);
    const second = await begin(other, next.ticket);
    const invalid = assert.rejects(second.completion);
    const address = await endpoint(other, next.ticket);
    assert.notEqual(address.token, stale.token);
    const remote = consumer({ ...address, token: stale.token }, next);
    await assert.rejects(remote.result);
    assert.notEqual(await remote.exited, 0);
    await invalid;
    assert.equal(fixture.pool.stats().residentBytes, 0);
  });
  it("rejects bad authentication and unauthorized targets before allocating reads", async () => {
    await assert.rejects(offer(fixture.client("wrong")));
    await assert.rejects(
      call(fixture.client(), { operation: "offer", id: "private" }),
      /not authorized/,
    );
    expect(fixture.broker.stats().admissions).toBe(0);
    assert.equal((await fixture.driver.readStats()).reads, 0);
    assert.equal(fixture.spawned, 0);
  });
  it.each(["public", "empty"] as const)(
    "delivers %s with one-use socket authority and native snapshot release before slow consumption",
    async (id) => {
      const client = fixture.client();
      const other = fixture.client();
      const offered = await offer(client, id);
      assert.deepEqual(Object.keys(offered).sort(), [
        "sha256",
        "sizeBytes",
        "ticket",
      ]);
      await assert.rejects(endpoint(client, offered.ticket), /Unknown/);
      await assert.rejects(begin(other, offered.ticket), /foreign/);
      assert.equal(fixture.spawned, 0);
      const transfer = await begin(client, offered.ticket);
      await assert.rejects(endpoint(other, offered.ticket), /foreign/);
      const address = await endpoint(client, offered.ticket);
      await assert.rejects(endpoint(client, offered.ticket), /Unknown/);
      await assert.rejects(begin(client, offered.ticket), /Unknown/);
      const remote = consumer(address, offered, { pause: true });
      await remote.held;
      expect(fixture.pool.egress.stats().reservedBytes).toBe(STAGE_CHUNK_BYTES);
      assert.equal(
        fixture.pool.networkEgress.stats().reservedBytes,
        NETWORK_SCRATCH_BYTES,
      );
      assert.equal(fixture.pool.stats().scratchBytes, 0);
      await fixture.driver.execute({
        sql: "UPDATE readable_payloads SET bytes=x'01' WHERE id=?",
        args: [id],
      });
      remote.resume();
      const received = await remote.result;
      assert.equal(await remote.exited, 0);
      assert.deepEqual(await transfer.completion, received);
      assert.deepEqual(received, {
        sizeBytes: offered.sizeBytes,
        sha256: offered.sha256,
      });
      if (id === "public") assert.equal(received.sha256, SHA);
      assert.equal(fixture.broker.stats().admissions, 0);
      assert.equal(fixture.pool.stats().residentBytes, 0);
      assert.equal(fixture.pool.egress.stats().slots, 0);
      assert.equal(fixture.pool.networkEgress.stats().slots, 0);
      await fixture.driver.close();
      const restoredPath = join(fixture.directory, "restored.db");
      await copyFile(fixture.path, restoredPath);
      const restored = new SqlWorkerDriver({
        url: pathToFileURL(restoredPath).href,
        workerUrl,
      });
      try {
        assert.equal(
          (
            await restored.execute({
              sql: "SELECT hex(bytes) AS bytes FROM readable_payloads WHERE id=?",
              args: [id],
            })
          ).rows[0]?.["bytes"],
          "01",
        );
      } finally {
        await restored.close();
      }
    },
  );
  it("retires idle offers on disconnect and denies a same-session reconnect", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const read = await offer(client);
    client.close();
    await fixture.broker.retirement(connection);
    expect(fixture.pool.stats().residentBytes).toBe(0);
    await assert.rejects(begin(fixture.client(), read.ticket), /Unknown/);
  });
  it.each(["token", "sequence", "credit", "truncated-ack", "disconnect"])(
    "rejects %s and releases read/transport resources",
    async (fault) => {
      const client = fixture.client();
      const read = await offer(client);
      const transfer = await begin(client, read.ticket);
      const rejected = assert.rejects(transfer.completion);
      const remote = consumer(await endpoint(client, read.ticket), read, {
        fault,
      });
      await assert.rejects(remote.result);
      assert.notEqual(await remote.exited, 0);
      await rejected;
      expect(fixture.pool.stats().residentBytes).toBe(0);
      assert.equal(fixture.pool.networkEgress.stats().slots, 0);
      assert.equal(fixture.pool.egress.stats().slots, 0);
      assert.equal(
        (
          await fixture.driver.execute({
            sql: "SELECT count(*) AS n FROM readable_payloads",
          })
        ).rows[0]?.["n"],
        3,
      );
    },
  );
  it.each(["cancel", "disconnect"])(
    "reclaims a slow read on control %s without revoking a sibling offer",
    async (mode) => {
      const client = fixture.client();
      const connection = await fixture.connection(client);
      const other = mode === "cancel" ? client : fixture.client();
      const sibling = await offer(other, "empty");
      const read = await offer(client);
      const cancellation = new AbortController();
      const transfer = await begin(client, read.ticket, cancellation.signal);
      const rejected = assert.rejects(transfer.completion);
      const remote = consumer(await endpoint(client, read.ticket), read, {
        pause: true,
      });
      await remote.held;
      if (mode === "cancel") cancellation.abort();
      else client.close();
      await rejected;
      assert.equal(fixture.broker.stats().tickets, 1);
      await call(other, { operation: "cancel", ticket: sibling.ticket });
      await fixture.broker.retirement(connection);
      expect(fixture.pool.egress.stats().slots).toBe(0);
      assert.equal(fixture.pool.networkEgress.stats().slots, 0);
      await remote.stop();
    },
  );
  it("revokes an offer cancelled after broker return but before RPC delivery", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const returned = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    fixture.afterResult = async (operation): Promise<void> => {
      if (operation === "offer") {
        returned.resolve();
        await release.promise;
      }
    };
    const cancellation = new AbortController();
    const rejected = assert.rejects(
      offer(client, "public", cancellation.signal),
    );
    try {
      await returned.promise;
      cancellation.abort();
      await rejected;
      await fixture.broker.retirement(connection);
      expect(fixture.pool.stats().residentBytes).toBe(0);
    } finally {
      release.resolve();
    }
  });
  it("retains a cancelled queued preparation until native snapshot rollback settles", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    const blocker = await fixture.driver.transaction("write");
    const submitted = Promise.withResolvers<void>();
    const cancelled = Promise.withResolvers<void>();
    fixture.driver.fillSubmitted = (): void => submitted.resolve();
    fixture.cancelled = (): void => cancelled.resolve();
    const cancellation = new AbortController();
    const rejected = assert.rejects(
      offer(client, "public", cancellation.signal),
    );
    try {
      await submitted.promise;
      assert.equal((await fixture.driver.readStats()).preparing, 1);
      cancellation.abort();
      await rejected;
      await cancelled.promise;
      await fixture.broker.cleanupSettled();
      expect(fixture.pool.stats().residentBytes).toBe(65539);
      assert.equal(fixture.pool.stats().scratchSlots, 1);
      await blocker.rollback();
      await fixture.broker.retirement(connection);
      assert.equal(fixture.pool.stats().residentBytes, 0);
    } finally {
      await blocker.rollback();
    }
  });
  it("bounds idle read authority at sixteen and serializes disconnect cleanup", async () => {
    const client = fixture.client();
    const connection = await fixture.connection(client);
    for (let index = 0; index < 16; index++) await offer(client, "empty");
    await assert.rejects(offer(client, "empty"), /capacity exceeded/);
    expect(fixture.broker.stats().admissions).toBe(16);
    client.close();
    await fixture.broker.retirement(connection);
    assert.equal((await fixture.driver.readStats()).scopes, 0);
  });
});
