// Dedicated, trusted fixture producer. It never opens a database and never sends
// payload bytes to its parent. Runtime provider/image workers are not wired yet.
import {
  isMainThread,
  parentPort,
  workerData,
  threadId,
} from "node:worker_threads";
import { z } from "@brains/utils/zod";
import {
  STAGE_BUDGET_BYTES,
  STAGE_CHUNK_BYTES,
} from "../../../src/turso-worker/binary-protocol";
import { deserializeError } from "../../../src/turso-worker/error-protocol";
import {
  uploadBootstrapSchema,
  uploadOutputSchema,
} from "../../../src/turso-worker/upload-protocol";

if (isMainThread || !parentPort)
  throw new Error("Upload producer requires its own worker");
const parent = parentPort;
const source = z
  .strictObject({
    size: z.number().int().min(0).max(STAGE_BUDGET_BYTES),
    pause: z.boolean().default(false),
    park: z
      .instanceof(SharedArrayBuffer)
      .refine((value) => value.byteLength === 4)
      .optional(),
    fault: z
      .enum(["grant", "replay", "sequence", "backing", "sql", "exit"])
      .optional(),
  })
  .parse(workerData);
let booted = false;
let resume: (() => void) | undefined;
parent.on("message", (input: unknown) => {
  if (booted) {
    z.strictObject({ kind: z.literal("resume") }).parse(input);
    if (!resume) throw new Error("Producer is not paused");
    const proceed = resume;
    resume = undefined;
    proceed();
    return;
  }
  booted = true;
  const { port, grant } = uploadBootstrapSchema.parse(input);
  if (grant.direction !== "upload")
    throw new Error("Wrong producer grant direction");
  let received = 0;
  let sequence = 0;
  let sealed = false;
  port.on("message", (input: unknown) => {
    const message = uploadOutputSchema.parse(input);
    if (message.kind === "error") throw deserializeError(message.error);
    if (message.kind === "sealed") {
      if (received !== source.size)
        throw new Error("Producer received a premature seal");
      sealed = true;
      port.close();
      parent.close();
      return;
    }
    if (message.sequence !== sequence || resume)
      throw new Error("Producer received unsolicited credit");
    const send = (): void => {
      if (source.fault === "exit") {
        port.close();
        parent.close();
        return;
      }
      if (source.fault === "replay") {
        port.postMessage({ kind: "hello", grant });
        return;
      }
      if (source.fault === "sql") {
        port.postMessage({ kind: "execute", sql: "DROP TABLE proof_uploads" });
        return;
      }
      if (source.fault === "backing") {
        // Malformed peer test only; not a supported credited producer.
        const oversized = new ArrayBuffer(STAGE_CHUNK_BYTES + 1);
        port.postMessage(
          {
            kind: "chunk",
            sequence,
            credit: message.credit,
            size: 1,
            bytes: oversized,
          },
          [oversized],
        );
        return;
      }
      if (source.fault === "sequence") sequence++;
      if (received === source.size) {
        port.postMessage(
          {
            kind: "finish",
            sequence,
            credit: message.credit,
            bytes: message.bytes,
          },
          [message.bytes],
        );
      } else {
        const size = Math.min(STAGE_CHUNK_BYTES, source.size - received);
        new Uint8Array(message.bytes).fill(0x5a, 0, size);
        port.postMessage(
          {
            kind: "chunk",
            sequence,
            credit: message.credit,
            size,
            bytes: message.bytes,
          },
          [message.bytes],
        );
        received += size;
        sequence++;
      }
      if (message.bytes.byteLength !== 0)
        throw new Error("Producer credit was not detached on transfer");
    };
    if (source.pause && received === 0) {
      resume = send;
      parent.postMessage({ kind: "credit-held", threadId, pid: process.pid });
      if (source.park) Atomics.wait(new Int32Array(source.park), 0, 0);
    } else send();
  });
  port.on("close", () => {
    if (!sealed)
      throw new Error("Upload channel closed before seal acknowledgement");
  });
  port.on("messageerror", (error: unknown) => {
    throw new Error("Producer could not decode upload response", {
      cause: error,
    });
  });
  port.postMessage({
    kind: "hello",
    grant:
      source.fault === "grant"
        ? { ...grant, stage: { ...grant.stage, scope: crypto.randomUUID() } }
        : grant,
  });
});
