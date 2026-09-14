// Generic installed transport proof, not authenticated RPC or runtime adoption.
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { mkdtemp, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "@brains/utils/zod";
import { SqlWorkerDriver } from "../../../src/turso-worker/client";
import { PersistenceBudgetPool } from "../../../src/turso-worker/budget-pool";
import {
  NetworkProcessOwner,
  sidecarPath,
} from "../../../src/turso-worker/network-process-owner";
import { readEndpointSchema } from "../../../src/turso-worker/network-read-protocol";
import {
  serializeError,
  type ProofError,
} from "../../../src/turso-worker/error-protocol";
import {
  STAGE_CHUNK_BYTES,
  type SealedStage,
} from "../../../src/turso-worker/binary-protocol";
import type { BlobFacts } from "../../../src/turso-worker/blob-protocol";

export interface NetworkReadSidecars {
  readBridgeUrl: URL;
  readConsumerUrl: URL;
  bunExecutable: string;
  outputFile?: string;
}
// Matches the canonical PNG uploaded and atomically published by network-exercise.
const SIZE = 2 * 1024 * 1024 + 7;
const SHA = "7e669b7062e7303b6b89603b041faaa151e9c0e37fed549258a422760a734962";
const plan = {
  table: "proof_network_reads",
  column: "bytes",
  key: [{ column: "id", value: 1 }],
  maxBytes: SIZE,
};
const listeningSchema = z.strictObject({
  kind: z.literal("network-listening"),
  endpoint: readEndpointSchema,
  pid: z.number().int().positive(),
  threadId: z.number().int().positive(),
});

export async function downloadNetworkFixture(
  driver: SqlWorkerDriver,
  pool: PersistenceBudgetPool,
  stage: SealedStage,
  options: NetworkReadSidecars,
  whileHeld: () => Promise<void>,
  pauseAfterBytes: number = STAGE_CHUNK_BYTES,
): Promise<BlobFacts> {
  const processes = new NetworkProcessOwner(
    options.bunExecutable,
    options.readConsumerUrl,
    "read",
  );
  const bridgePath = sidecarPath(options.readBridgeUrl);
  const cancellation = new AbortController();
  const endpoint = Promise.withResolvers<z.output<typeof readEndpointSchema>>();
  void endpoint.promise.catch(() => undefined); // The startup/exit rendezvous observes this rejection.
  const transfer = driver.download(
    stage.capability,
    () => {
      const peer = pool.networkEgress.spawn(() => new Worker(bridgePath));
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
            `Network read bridge exited before endpoint delivery: ${bridgePath}`,
          ),
        ),
      );
      return peer;
    },
    cancellation.signal,
  );
  const transferFailed = transfer.then<never>(() => {
    throw new Error("Network read completed before its consumer lifecycle");
  });
  void transferFailed.catch(() => undefined); // One startup/held observer, not a per-chunk retained race.
  const errors: unknown[] = [];
  let facts: BlobFacts | undefined;
  try {
    const address = await Promise.race([endpoint.promise, transferFailed]);
    const consumer = processes.spawn();
    assert.notEqual(consumer.pid, process.pid);
    const expected = { sizeBytes: stage.sizeBytes, sha256: stage.sha256 };
    consumer.start({
      direction: "read",
      endpoint: address,
      facts: expected,
      ...(options.outputFile !== undefined && {
        outputFile: options.outputFile,
      }),
      pauseAfterBytes,
    });
    const held = await Promise.race([consumer.held, transferFailed]);
    assert.equal(held.direction, "read");
    assert.equal(held.sizeBytes, Math.min(stage.sizeBytes, pauseAfterBytes));
    await whileHeld();
    consumer.resume();
    const [sealed, consumed, code] = await Promise.all([
      transfer,
      consumer.result,
      consumer.exited,
    ]);
    assert.equal(code, 0);
    assert.deepEqual(consumed, expected);
    assert.deepEqual(
      { sizeBytes: sealed.sizeBytes, sha256: sealed.sha256 },
      expected,
    );
    facts = consumed;
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
      "Network read and consumer lifecycle failed",
      { cause: cleanupError ?? errors[0] },
    );
  assert(facts);
  assert.equal(processes.stats().children, 0);
  return facts;
}
export async function exerciseNetworkRead(
  driver: SqlWorkerDriver,
  pool: PersistenceBudgetPool,
  options: NetworkReadSidecars,
): Promise<void> {
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "turso-network-output-"),
  );
  const outputFile = join(outputDirectory, "image.png");
  console.error(`[network-output] retained until success: ${outputDirectory}`);
  await driver.executeMultiple(
    "CREATE TABLE proof_network_reads (id INTEGER PRIMARY KEY, bytes BLOB NOT NULL); INSERT INTO proof_network_reads SELECT id, bytes FROM proof_network_payloads",
  );
  const scope = await driver.openReadScope();
  try {
    const stage = await scope.prepare(plan);
    assert.equal(stage.sha256, SHA);
    await downloadNetworkFixture(
      driver,
      pool,
      stage,
      { ...options, outputFile },
      async () => {
        assert.equal(pool.stats().scratchSlots, 0);
        assert.equal(pool.networkEgress.stats().slots, 1);
        // Hold the second credit after 64 KiB, then resume through the final tail.
        await driver.execute({
          sql: "UPDATE proof_network_reads SET bytes=x'01' WHERE id=1",
        });
      },
      2 * STAGE_CHUNK_BYTES,
    );
  } catch (error) {
    try {
      await scope.close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Network read and scope cleanup failed",
        { cause: cleanup },
      );
    }
    throw error;
  }
  await scope.close();
  assert.equal(pool.stats().residentBytes, 0);
  assert.equal(pool.egress.stats().slots, 0);
  assert.equal(pool.networkEgress.stats().slots, 0);
  await assertNetworkReadRows(driver);
  assert.equal((await stat(outputFile)).size, SIZE);
  await rm(outputDirectory, { recursive: true, force: true });
}
export async function assertNetworkReadRows(
  driver: SqlWorkerDriver,
): Promise<void> {
  assert.deepEqual(
    (
      await driver.execute({
        sql: "SELECT id, hex(bytes) AS bytes FROM proof_network_reads",
      })
    ).rows.map((row) => [row["id"], row["bytes"]]),
    [[1, "01"]],
  );
}
export async function exerciseNetworkReadArtifactFailure(
  url: string,
  workerUrl: URL,
  options: NetworkReadSidecars,
): Promise<ProofError> {
  const pool = new PersistenceBudgetPool();
  const driver = new SqlWorkerDriver({ url, workerUrl, budget: pool });
  let failure: unknown;
  const outputDirectory = await mkdtemp(
    join(tmpdir(), "turso-read-artifact-output-"),
  );
  const outputFile = join(outputDirectory, "output");
  console.error(`[read-artifact-output] retained: ${outputDirectory}`);
  try {
    await driver.executeMultiple(
      "CREATE TABLE proof_network_reads (id INTEGER PRIMARY KEY, bytes BLOB NOT NULL); INSERT INTO proof_network_reads VALUES (1, zeroblob(65539))",
    );
    const scope = await driver.openReadScope();
    try {
      const stage = await scope.prepare(plan);
      await assert.rejects(
        downloadNetworkFixture(
          driver,
          pool,
          stage,
          { ...options, outputFile },
          async () => {
            throw new Error(
              "Missing read artifact unexpectedly reached consumer handoff",
            );
          },
        ),
        (error: unknown) => {
          failure = error;
          return error instanceof Error;
        },
      );
      assert.deepEqual(await driver.verifyBlob(plan), {
        sizeBytes: stage.sizeBytes,
        sha256: stage.sha256,
      });
    } catch (error) {
      try {
        await scope.close();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "Read artifact and scope cleanup failed",
          { cause: cleanup },
        );
      }
      throw error;
    }
    await scope.close();
    assert.equal(
      (
        await driver.execute({
          sql: "SELECT count(*) AS n FROM proof_network_reads",
        })
      ).rows[0]?.["n"],
      1,
    );
    assert.equal(pool.stats().residentBytes, 0);
    assert.equal(pool.stats().scratchBytes, 0);
    assert.equal(pool.egress.stats().slots, 0);
    assert.equal(pool.networkEgress.stats().slots, 0);
  } catch (error) {
    try {
      await driver.close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "Read artifact and owner cleanup failed",
        { cause: cleanup },
      );
    }
    throw error;
  }
  await driver.close();
  return serializeError(failure);
}
