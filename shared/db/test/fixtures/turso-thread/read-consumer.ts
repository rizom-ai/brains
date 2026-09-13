import {
  isMainThread,
  parentPort,
  workerData,
  threadId,
} from "node:worker_threads";
import { createHash } from "node:crypto";
import { z } from "@brains/utils/zod";
import { uploadBootstrapSchema } from "../../../src/turso-worker/upload-protocol";
import { readOutputSchema } from "../../../src/turso-worker/read-protocol";
import { deserializeError } from "../../../src/turso-worker/error-protocol";

if (isMainThread || !parentPort)
  throw new Error("Read consumption requires a worker");
const parent = parentPort;
const options = z
  .strictObject({
    pause: z.boolean().default(false),
    fault: z
      .enum(["grant", "direction", "sequence", "replay", "sql", "backing"])
      .optional(),
    park: z
      .instanceof(SharedArrayBuffer)
      .refine((bytes) => bytes.byteLength === 4)
      .optional(),
  })
  .parse(workerData);
let booted = false;
let resume: (() => void) | undefined;
parent.on("message", (input: unknown) => {
  if (booted) {
    z.strictObject({ kind: z.literal("resume") }).parse(input);
    if (!resume) throw new Error("Read consumer is not paused");
    const proceed = resume;
    resume = undefined;
    proceed();
    return;
  }
  booted = true;
  const { port, grant } = uploadBootstrapSchema.parse(input);
  if (grant.direction !== "read")
    throw new Error("Wrong consumer grant direction");
  const hash = createHash("sha256");
  let received = 0;
  let sequence = 0;
  let completed = false;
  let paused = false;
  port.on("message", (input: unknown) => {
    const message = readOutputSchema.parse(input);
    if (message.kind === "error") throw deserializeError(message.error);
    if (message.kind === "sealed") {
      const sha256 = hash.digest("hex");
      if (
        received !== message.facts.sizeBytes ||
        sha256 !== message.facts.sha256
      )
        throw new Error("Read consumer digest mismatch");
      completed = true;
      parent.postMessage({
        kind: "consumed",
        sizeBytes: received,
        sha256,
        threadId,
        pid: process.pid,
      });
      port.close();
      parent.close();
      return;
    }
    if (message.sequence !== sequence || resume)
      throw new Error("Unsolicited read chunk");
    const consume = (): void => {
      if (options.fault === "replay") {
        port.postMessage({ kind: "hello", grant });
        return;
      }
      if (options.fault === "sql") {
        port.postMessage({ kind: "execute", sql: "DELETE FROM proof_reads" });
        return;
      }
      if (options.fault === "backing") {
        const bytes = new ArrayBuffer(1); // Deliberately malformed trusted fixture, not sandbox evidence.
        port.postMessage(
          { kind: "pull", sequence, credit: message.credit, bytes },
          [bytes],
        );
        return;
      }
      hash.update(new Uint8Array(message.bytes, 0, message.size));
      received += message.size;
      port.postMessage(
        {
          kind: "pull",
          sequence: options.fault === "sequence" ? sequence + 1 : sequence,
          credit: message.credit,
          bytes: message.bytes,
        },
        [message.bytes],
      );
      sequence++;
      if (message.bytes.byteLength !== 0)
        throw new Error("Read consumer did not transfer its credit");
    };
    if (options.pause && !paused) {
      paused = true;
      resume = consume;
      parent.postMessage({ kind: "chunk-held", threadId, pid: process.pid });
      if (options.park) Atomics.wait(new Int32Array(options.park), 0, 0);
    } else consume();
  });
  port.on("close", () => {
    if (!completed) throw new Error("Read stream closed before completion");
  });
  port.on("messageerror", (error: unknown) => {
    throw new Error("Read consumer could not decode response", {
      cause: error,
    });
  });
  port.postMessage({
    kind: "hello",
    grant:
      options.fault === "grant"
        ? { ...grant, stage: { ...grant.stage, scope: crypto.randomUUID() } }
        : options.fault === "direction"
          ? { ...grant, direction: "upload" }
          : grant,
  });
});
