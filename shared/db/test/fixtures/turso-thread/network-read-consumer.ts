// Separate consumer PROCESS. Payload hashing stays here; IPC is metadata only.
import { connect } from "node:net";
import { createHash } from "node:crypto";
import { z } from "@brains/utils/zod";
import {
  readEndpointSchema,
  readPauseAfterSchema,
} from "../../../src/turso-worker/network-read-protocol";
import { blobFactsSchema } from "../../../src/turso-worker/blob-protocol";
import {
  DATA_HEADER_BYTES,
  SEAL_BYTES,
  parseDataHeader,
  encodeCredit,
  readFixed,
  readInto,
  writeBytes,
  endSocket,
} from "../../../src/turso-worker/network-wire";
import { STAGE_CHUNK_BYTES } from "../../../src/turso-worker/binary-protocol";
import { serializeError } from "../../../src/turso-worker/error-protocol";

const optionsSchema = z.strictObject({
  endpoint: readEndpointSchema,
  facts: blobFactsSchema,
  pause: z.boolean().default(false),
  pauseAfterBytes: readPauseAfterSchema.default(STAGE_CHUNK_BYTES),
  fragmentAck: z.boolean().default(false),
  fault: z
    .enum(["token", "sequence", "credit", "truncated-ack", "disconnect"])
    .optional(),
});
let booted = false;
let resume: (() => void) | undefined;
process.on("message", (input: unknown) => {
  if (booted) {
    z.strictObject({ kind: z.literal("resume") }).parse(input);
    if (!resume) throw new Error("Read consumer is not paused");
    resume();
    resume = undefined;
    return;
  }
  booted = true;
  const options = optionsSchema.parse(input);
  process.send?.({
    kind: "runtime",
    pid: process.pid,
    executable: process.execPath,
    sidecarUrl: import.meta.url,
  });
  void consume(options).then(
    () => process.disconnect(),
    (error: unknown) => {
      process.send?.({
        kind: "failed",
        pid: process.pid,
        error: serializeError(error),
      });
      process.exitCode = 1;
      process.disconnect();
    },
  );
});
async function consume(options: z.output<typeof optionsSchema>): Promise<void> {
  const socket = connect({
    host: options.endpoint.host,
    port: options.endpoint.port,
  });
  let socketError: Error | undefined;
  socket.on("error", (error) => {
    socketError = error;
  }); // Operation helpers also observe errors.
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    await writeBytes(
      socket,
      Buffer.from(
        options.fault === "token" ? "0".repeat(64) : options.endpoint.token,
        "ascii",
      ),
    );
    const hash = createHash("sha256");
    const bytes = new Uint8Array(STAGE_CHUNK_BYTES);
    let received = 0;
    let sequence = 0;
    let paused = false;
    do {
      const header = parseDataHeader(
        await readFixed(socket, DATA_HEADER_BYTES),
      );
      if (
        header.sequence !== sequence ||
        header.size > options.facts.sizeBytes - received ||
        (header.kind === "finish" && options.facts.sizeBytes !== 0)
      )
        throw new Error("Unexpected network read frame");
      await readInto(socket, bytes.subarray(0, header.size));
      hash.update(bytes.subarray(0, header.size));
      received += header.size;
      if (
        options.pause &&
        !paused &&
        received >= Math.min(options.pauseAfterBytes, options.facts.sizeBytes)
      ) {
        paused = true;
        await new Promise<void>((resolve) => {
          resume = resolve;
          process.send?.({
            kind: "chunk-held",
            pid: process.pid,
            sizeBytes: received,
            sha256: hash.copy().digest("hex"),
          });
        });
      }
      if (options.fault === "disconnect") {
        socket.destroy();
        throw new Error("Injected read consumer disconnect");
      }
      const ack = encodeCredit({
        sequence: options.fault === "sequence" ? sequence + 1 : sequence,
        credit:
          options.fault === "credit" ? crypto.randomUUID() : header.credit,
      });
      if (options.fault === "truncated-ack") {
        await writeBytes(socket, ack.subarray(0, ack.byteLength - 1));
        socket.end();
        throw new Error("Injected truncated read acknowledgement");
      }
      if (options.fragmentAck) {
        await writeBytes(socket, ack.subarray(0, 1));
        await writeBytes(socket, ack.subarray(1));
      } else await writeBytes(socket, ack);
      if (socketError) throw socketError;
      sequence++;
    } while (received < options.facts.sizeBytes);
    const seal = await readFixed(socket, SEAL_BYTES);
    const sha256 = hash.digest("hex");
    if (
      seal[0] !== 0x53 ||
      seal.readUInt32BE(1) !== received ||
      received !== options.facts.sizeBytes ||
      seal.toString("utf8", 5) !== sha256 ||
      sha256 !== options.facts.sha256
    )
      throw new Error("Network read digest or size mismatch");
    await endSocket(socket);
    process.send?.({
      kind: "consumed",
      pid: process.pid,
      sizeBytes: received,
      sha256,
    });
  } finally {
    socket.destroy();
  }
}
