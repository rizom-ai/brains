import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { z } from "@brains/utils/zod";
import type { TursoThreadProof } from "./client";
const SHA = "d4f9bcbd9be765d114b85ab79d16c218fb5c1e03315f689603d48eed00bff97f";
const messageSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("chunk-held"),
    threadId: z.number().int().positive(),
    pid: z.number().int().positive(),
  }),
  z.strictObject({
    kind: z.literal("consumed"),
    sizeBytes: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    threadId: z.number().int().positive(),
    pid: z.number().int().positive(),
  }),
]);
export async function exerciseReadSnapshots(
  driver: TursoThreadProof,
  consumerUrl: URL,
): Promise<void> {
  await driver.executeMultiple(
    "CREATE TABLE proof_reads (id INTEGER PRIMARY KEY, bytes BLOB NOT NULL); INSERT INTO proof_reads VALUES (1, zeroblob(65539))",
  );
  const scope = await driver.openReadScope();
  const held = Promise.withResolvers<Worker>();
  const consumed = Promise.withResolvers<void>();
  try {
    const read = await scope.prepare({
      table: "proof_reads",
      column: "bytes",
      key: [{ column: "id", value: 1 }],
      maxBytes: 65539,
    });
    assert.equal(read.sha256, SHA);
    const transfer = scope.download(read.capability, () => {
      const peer = new Worker(consumerUrl, { workerData: { pause: true } });
      const identity = peer.threadId;
      peer.on("error", (error) => {
        held.reject(error);
        consumed.reject(error);
      });
      peer.on("message", (input: unknown) => {
        const message = messageSchema.parse(input); // Metadata only on the parent port.
        assert.equal(message.pid, process.pid);
        assert.equal(message.threadId, identity);
        if (message.kind === "chunk-held") held.resolve(peer);
        else {
          assert.equal(message.sizeBytes, 65539);
          assert.equal(message.sha256, SHA);
          consumed.resolve();
        }
      });
      return peer;
    });
    void transfer.catch(() => undefined); // Awaited below; scope/driver cleanup also drains the task.
    void consumed.promise.catch(() => undefined); // May fail before the held-chunk rendezvous.
    const peer = await held.promise;
    assert.equal((await driver.readStats()).streaming, 1);
    // An actual write must finish while the consumer deliberately holds credit.
    await driver.executeMultiple(
      "UPDATE proof_reads SET bytes=x'01' WHERE id=1; INSERT INTO proof_reads VALUES (2, x'02')",
    );
    peer.postMessage({ kind: "resume" });
    assert.equal((await transfer).sha256, SHA);
    await consumed.promise;
    assert.equal((await driver.readStats()).reads, 0);
  } finally {
    await scope.close();
  }
}
export async function assertReadRows(driver: TursoThreadProof): Promise<void> {
  const result = await driver.execute({
    sql: "SELECT id, hex(bytes) AS bytes FROM proof_reads ORDER BY id",
  });
  assert.deepEqual(
    result.rows.map((row) => [row["id"], row["bytes"]]),
    [
      [1, "01"],
      [2, "02"],
    ],
  );
}
