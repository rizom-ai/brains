// A separate payload PROCESS reads a real file or generates fixture bytes.
// IPC carries bounded metadata only; file failures never fall back to fixtures.
import { connect } from "node:net";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import {
  withFileSource,
  type FileChunkSource,
} from "../../../src/turso-worker/file-source";
import { z } from "@brains/utils/zod";
import {
  networkEndpointSchema,
  CREDIT_HEADER_BYTES,
  SEAL_BYTES,
  decodeCredit,
  encodeData,
  readFixed,
  writeBytes,
  endSocket,
} from "../../../src/turso-worker/network-wire";
import {
  STAGE_BUDGET_BYTES,
  STAGE_CHUNK_BYTES,
} from "../../../src/turso-worker/binary-protocol";
import { serializeError } from "../../../src/turso-worker/error-protocol";

const optionsSchema = z.strictObject({
  endpoint: networkEndpointSchema,
  size: z.number().int().min(0).max(STAGE_BUDGET_BYTES),
  sourceFile: z.string().min(1).max(4096).refine(isAbsolute).optional(),
  fragment: z.boolean().default(false),
  pause: z.boolean().default(false),
  fault: z
    .enum([
      "token",
      "sequence",
      "credit",
      "oversize",
      "truncated",
      "disconnect",
    ])
    .optional(),
});
let booted = false;
let resume: (() => void) | undefined;
process.on("message", (input: unknown) => {
  if (booted) {
    z.strictObject({ kind: z.literal("resume") }).parse(input);
    if (!resume) throw new Error("Network producer is not paused");
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
  void run(options).then(
    () => process.disconnect(),
    (error: unknown) => {
      process.send?.({
        kind: "failed",
        error: serializeError(error),
        pid: process.pid,
      });
      process.exitCode = 1;
      process.disconnect();
    },
  );
});
async function run(options: z.output<typeof optionsSchema>): Promise<void> {
  const facts =
    options.sourceFile === undefined
      ? await transfer(options)
      : await withFileSource(
          { path: options.sourceFile, sizeBytes: options.size },
          (source) => transfer(options, source),
        );
  // A receipt follows file close, socket completion and the native seal acknowledgement.
  process.send?.({ kind: "sealed", ...facts, pid: process.pid });
}
async function transfer(
  options: z.output<typeof optionsSchema>,
  source?: FileChunkSource,
): Promise<{ sizeBytes: number; sha256: string }> {
  const socket = connect({
    host: options.endpoint.host,
    port: options.endpoint.port,
  });
  // read/write helpers observe operation failures; this handler prevents an error
  // event between operations from escaping without the bounded IPC diagnostic.
  let socketError: Error | undefined;
  socket.on("error", (error) => {
    socketError = error;
  });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    const write = async (bytes: Uint8Array): Promise<void> => {
      if (options.fragment && bytes.byteLength > 1) {
        await writeBytes(socket, bytes.subarray(0, 1));
        await writeBytes(socket, bytes.subarray(1));
      } else await writeBytes(socket, bytes);
      if (socketError) throw socketError;
    };
    await write(
      Buffer.from(
        options.fault === "token" ? "0".repeat(64) : options.endpoint.token,
        "ascii",
      ),
    );
    let sent = 0;
    let sequence = 0;
    const hash = createHash("sha256");
    const bytes = new Uint8Array(STAGE_CHUNK_BYTES);
    for (;;) {
      const credit = decodeCredit(await readFixed(socket, CREDIT_HEADER_BYTES));
      if (credit.sequence !== sequence)
        throw new Error("Unexpected network producer sequence");
      if (options.pause && sent === 0) {
        await new Promise<void>((resolve) => {
          resume = resolve;
          process.send?.({ kind: "credit-held", pid: process.pid });
        });
      }
      if (options.fault === "disconnect") {
        socket.destroy();
        throw new Error("Injected network producer disconnect");
      }
      const size = Math.min(STAGE_CHUNK_BYTES, options.size - sent);
      const header = encodeData({
        ...credit,
        sequence: options.fault === "sequence" ? sequence + 1 : sequence,
        credit:
          options.fault === "credit" ? crypto.randomUUID() : credit.credit,
        kind: size === 0 ? "finish" : "chunk",
        size: options.fault === "oversize" ? STAGE_CHUNK_BYTES + 1 : size,
      });
      if (size === 0 && source) await source.complete();
      await write(header);
      if (
        options.fault === "oversize" ||
        options.fault === "sequence" ||
        options.fault === "credit"
      ) {
        // A malformed header must fail without sending any body bytes.
        await readFixed(socket, CREDIT_HEADER_BYTES);
        throw new Error("Server accepted an invalid network header");
      }
      if (size === 0) break;
      if (source) await source.readInto(bytes.subarray(0, size));
      else bytes.fill(0x5a, 0, size);
      if (options.fault === "truncated") {
        await write(bytes.subarray(0, size - 1));
        socket.end();
        throw new Error("Injected truncated network frame");
      }
      await write(bytes.subarray(0, size));
      hash.update(bytes.subarray(0, size));
      sent += size;
      sequence++;
    }
    const seal = await readFixed(socket, SEAL_BYTES);
    const sha256 = hash.digest("hex");
    if (
      seal[0] !== 0x53 ||
      seal.readUInt32BE(1) !== sent ||
      seal.toString("utf8", 5) !== sha256
    )
      throw new Error("Invalid network seal acknowledgement");
    await endSocket(socket);
    return { sizeBytes: sent, sha256 };
  } finally {
    socket.destroy();
  }
}
