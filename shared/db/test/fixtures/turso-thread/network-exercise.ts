import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { z } from "@brains/utils/zod";
import { sql } from "drizzle-orm";
import { blob, integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { SqlWorkerDriver } from "../../../src/turso-worker/client";
import { PersistenceBudgetPool } from "../../../src/turso-worker/budget-pool";
import {
  serializeError,
  type ProofError,
} from "../../../src/turso-worker/error-protocol";
import type {
  StageCapability,
  SealedStage,
} from "../../../src/turso-worker/binary-protocol";
import { withBinaryTransaction } from "../../../src/turso-worker/binary-transaction";
import {
  networkEndpointSchema,
  type NetworkEndpoint,
} from "../../../src/turso-worker/network-wire";
import {
  NetworkProcessOwner,
  sidecarPath,
} from "../../../src/turso-worker/network-process-owner";

export interface NetworkSidecars {
  bridgeUrl: URL;
  producerUrl: URL;
  bunExecutable: string;
}
const networkPayloads = sqliteTable("proof_network_payloads", {
  id: integer("id").primaryKey(),
  bytes: blob("bytes", { mode: "buffer" }).notNull(),
});
const SIZE = 2 * 1024 * 1024 + 7;
const SHA256 =
  "7e669b7062e7303b6b89603b041faaa151e9c0e37fed549258a422760a734962";
const listeningSchema = z.strictObject({
  kind: z.literal("network-listening"),
  endpoint: networkEndpointSchema,
  pid: z.number().int().positive(),
  threadId: z.number().int().positive(),
});

/** Generic local authority only. Authenticated RPC scope evidence stays in scripts. */
export async function uploadNetworkFixture(
  driver: SqlWorkerDriver,
  pool: PersistenceBudgetPool,
  stage: StageCapability,
  size: number,
  options: NetworkSidecars & { sourceFile?: string | undefined },
): Promise<SealedStage> {
  const processes = new NetworkProcessOwner(
    options.bunExecutable,
    options.producerUrl,
    "upload",
  );
  const bridgePath = sidecarPath(options.bridgeUrl);
  const cancellation = new AbortController();
  const endpoint = Promise.withResolvers<NetworkEndpoint>();
  void endpoint.promise.catch(() => undefined); // Startup/exit may precede the endpoint rendezvous.
  const transfer = driver.upload(
    stage,
    () => {
      const peer = pool.networkIngress.spawn(() => new Worker(bridgePath));
      peer.once("message", (input: unknown) => {
        try {
          const message = listeningSchema.parse(input);
          assert.equal(message.pid, process.pid);
          assert.equal(message.threadId, peer.threadId);
          endpoint.resolve(message.endpoint);
        } catch (error) {
          endpoint.reject(error);
          cancellation.abort(error);
        }
      });
      peer.once("error", (error) => endpoint.reject(error));
      peer.once("exit", () =>
        endpoint.reject(
          new Error(
            `Network bridge exited before endpoint delivery: ${bridgePath}`,
          ),
        ),
      );
      return peer;
    },
    cancellation.signal,
  );
  // One observer for this transfer, not one failure race per payload chunk.
  const transferFailed = transfer.then<never>(() => {
    throw new Error("Network transfer completed before its producer lifecycle");
  });
  void transferFailed.catch(() => undefined); // Observed by startup/held-credit rendezvous only.
  const errors: unknown[] = [];
  let facts: SealedStage | undefined;
  try {
    const address = await Promise.race([endpoint.promise, transferFailed]);
    const producer = processes.spawn();
    assert.notEqual(producer.pid, process.pid);
    producer.start({
      direction: "upload",
      endpoint: address,
      size,
      ...(options.sourceFile !== undefined && {
        sourceFile: options.sourceFile,
      }),
    });
    await Promise.race([producer.held, transferFailed]);
    // The real remote process deliberately holds network credit. The owner is
    // still usable; this is not a timing/throughput or canonical HTTP claim.
    assert.equal(
      (await driver.execute({ sql: "SELECT 1 AS n" })).rows[0]?.["n"],
      1,
    );
    producer.resume();
    const [sealed, produced, code] = await Promise.all([
      transfer,
      producer.result,
      producer.exited,
    ]);
    assert.equal(code, 0);
    assert.deepEqual(
      { sizeBytes: sealed.sizeBytes, sha256: sealed.sha256 },
      produced,
    );
    facts = sealed;
  } catch (error) {
    errors.push(error);
    cancellation.abort(error);
  }
  const [closed, settled] = await Promise.allSettled([
    processes.close(),
    transfer,
  ]);
  let cleanupError: unknown;
  if (closed.status === "rejected") {
    cleanupError = closed.reason;
    if (!errors.includes(closed.reason)) errors.push(closed.reason);
  }
  if (settled.status === "rejected" && !errors.includes(settled.reason))
    errors.push(settled.reason);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "Network transfer and producer lifecycle failed",
      { cause: cleanupError ?? errors[0] },
    );
  assert(facts);
  assert.equal(processes.stats().children, 0);
  return facts;
}
export async function exerciseNetworkIngress(
  driver: SqlWorkerDriver,
  pool: PersistenceBudgetPool,
  options: NetworkSidecars,
): Promise<void> {
  await driver.executeMultiple(
    "CREATE TABLE proof_network_payloads (id INTEGER PRIMARY KEY, bytes BLOB NOT NULL); CREATE TABLE proof_network_refs (id INTEGER PRIMARY KEY REFERENCES proof_network_payloads(id)); CREATE TABLE proof_network_effects (id INTEGER PRIMARY KEY REFERENCES proof_network_payloads(id))",
  );
  const scope = await driver.openBinaryScope();
  const errors: unknown[] = [];
  let sourceDirectory: string | undefined;
  try {
    sourceDirectory = await mkdtemp(join(tmpdir(), "turso-network-file-"));
    console.error(
      `[network-file] fixture retained until success: ${sourceDirectory}`,
    );
    const sourceFile = join(sourceDirectory, "canonical-image.png");
    // Fixture generation only; transfer control passes the filename, not bytes.
    const bytes = Buffer.alloc(SIZE);
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ).copy(bytes);
    await writeFile(sourceFile, bytes);
    const stage = await scope.begin({
      reservationBytes: SIZE,
      expectedSize: SIZE,
      expectedDigest: SHA256,
    });
    const facts = await uploadNetworkFixture(driver, pool, stage, SIZE, {
      ...options,
      sourceFile,
    });
    assert.deepEqual(facts, {
      capability: stage,
      sizeBytes: SIZE,
      sha256: SHA256,
    });
    assert.equal(pool.ingress.stats().slots, 0);
    assert.equal(pool.networkIngress.stats().slots, 0);
    const claim = await scope.reserve(stage);
    await withBinaryTransaction(driver, [claim], async (context) => {
      await context.executeBound(
        context.db
          .insert(networkPayloads)
          .values({ id: 1, bytes: sql`${sql.placeholder("network")}` }),
        new Map([["network", claim]]),
      );
      await context.db.run(sql`INSERT INTO proof_network_refs VALUES (1)`);
      await context.db.run(sql`INSERT INTO proof_network_effects VALUES (1)`);
    });
    await assertNetworkRows(driver);
  } catch (error) {
    errors.push(error);
  }
  try {
    await scope.close();
  } catch (cleanup) {
    errors.push(cleanup);
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        "Network proof and scope cleanup failed",
        { cause: cleanup },
      );
  }
  if (errors.length > 0) throw errors[0];
  assert.equal(pool.stats().residentBytes, 0);
  if (sourceDirectory)
    await rm(sourceDirectory, { recursive: true, force: true });
}
export async function exerciseNetworkArtifactFailure(
  url: string,
  workerUrl: URL,
  options: NetworkSidecars,
): Promise<ProofError> {
  const pool = new PersistenceBudgetPool();
  const driver = new SqlWorkerDriver({ url, workerUrl, budget: pool });
  let failure: unknown;
  try {
    await assert.rejects(
      exerciseNetworkIngress(driver, pool, options),
      (error: unknown) => {
        failure = error;
        return error instanceof Error;
      },
    );
    assert.equal(
      (
        await driver.execute({
          sql: "SELECT count(*) AS n FROM proof_network_payloads",
        })
      ).rows[0]?.["n"],
      0,
    );
    assert.equal(
      (
        await driver.execute({
          sql: "SELECT count(*) AS n FROM proof_network_refs",
        })
      ).rows[0]?.["n"],
      0,
    );
    assert.equal(
      (
        await driver.execute({
          sql: "SELECT count(*) AS n FROM proof_network_effects",
        })
      ).rows[0]?.["n"],
      0,
    );
    assert.equal(pool.stats().residentBytes, 0);
    assert.equal(pool.stats().scratchBytes, 0);
    assert.equal(pool.ingress.stats().slots, 0);
    assert.equal(pool.networkIngress.stats().slots, 0);
  } catch (error) {
    try {
      await driver.close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Network artifact check and owner cleanup failed",
        { cause: cleanup },
      );
    }
    throw error;
  }
  await driver.close();
  return serializeError(failure);
}
export async function assertNetworkRows(
  driver: SqlWorkerDriver,
): Promise<void> {
  assert.deepEqual(
    await driver.verifyBlob({
      table: "proof_network_payloads",
      column: "bytes",
      key: [{ column: "id", value: 1 }],
      maxBytes: SIZE,
    }),
    { sizeBytes: SIZE, sha256: SHA256 },
  );
  assert.equal(
    (
      await driver.execute({
        sql: "SELECT count(*) AS n FROM proof_network_payloads JOIN proof_network_refs USING(id) JOIN proof_network_effects USING(id)",
      })
    ).rows[0]?.["n"],
    1,
  );
}
