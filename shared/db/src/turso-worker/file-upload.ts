import { createHash } from "node:crypto";
import { Socket } from "node:net";
import { isAbsolute } from "node:path";
import { z } from "@brains/utils/zod";
import { withFileSource, type FileChunkSource } from "./file-source";
import { STAGE_BUDGET_BYTES, STAGE_CHUNK_BYTES } from "./binary-protocol";
import type { BlobFacts } from "./blob-protocol";
import {
  networkEndpointSchema,
  CREDIT_HEADER_BYTES,
  SEAL_BYTES,
  decodeCredit,
  encodeData,
  readFixed,
  writeBytes,
  endSocket,
} from "./network-wire";

export const fileUploadSchema: z.ZodObject<{
  endpoint: typeof networkEndpointSchema;
  size: z.ZodNumber;
  sourceFile: z.ZodString;
}> = z.strictObject({
  endpoint: networkEndpointSchema,
  size: z.number().int().min(0).max(STAGE_BUDGET_BYTES),
  sourceFile: z.string().min(1).max(4096).refine(isAbsolute),
});
export type FileUploadInput = z.output<typeof fileUploadSchema>;
export interface FileUploadControl {
  signal?: AbortSignal;
  /** Once, after the first credit and before acquiring the borrowed data buffer. */
  ready?: () => Promise<void>;
}

/** Payload-actor operation, not a controller API. Returns only after native seal,
 * socket close and file close acknowledgements. File errors never select a generator.
 */
export async function uploadFile(
  input: FileUploadInput,
  control: FileUploadControl = {},
): Promise<BlobFacts> {
  const options = fileUploadSchema.parse(input);
  control.signal?.throwIfAborted();
  return withFileSource(
    { path: options.sourceFile, sizeBytes: options.size },
    (source) => transfer(source, options, control),
  );
}

async function transfer(
  source: FileChunkSource,
  options: FileUploadInput,
  control: FileUploadControl,
): Promise<BlobFacts> {
  control.signal?.throwIfAborted();
  const socket = new Socket();
  const connected = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const interrupted = Promise.withResolvers<never>();
  void interrupted.promise.catch(() => undefined); // Observed by connection/readiness gates and socket cleanup.
  let socketError: Error | undefined;
  socket.once("connect", () => connected.resolve());
  socket.on("error", (error) => {
    socketError ??= error;
    interrupted.reject(error);
  });
  socket.once("close", () => {
    closed.resolve();
    interrupted.reject(socketError ?? new Error("File upload socket closed"));
  });
  const abort = (): void => {
    socket.destroy(
      new Error("File upload control was cancelled", {
        cause: control.signal?.reason,
      }),
    );
  };
  control.signal?.addEventListener("abort", abort, { once: true });
  const errors: unknown[] = [];
  let result: BlobFacts | undefined;
  try {
    control.signal?.throwIfAborted();
    socket.connect({
      host: options.endpoint.host,
      port: options.endpoint.port,
    });
    await Promise.race([connected.promise, interrupted.promise]);
    await writeBytes(socket, Buffer.from(options.endpoint.token, "ascii"));
    let sent = 0;
    let sequence = 0;
    let bytes: Uint8Array | undefined;
    const hash = createHash("sha256");
    for (;;) {
      control.signal?.throwIfAborted();
      const credit = decodeCredit(await readFixed(socket, CREDIT_HEADER_BYTES));
      if (credit.sequence !== sequence)
        throw new Error("Unexpected file upload sequence");
      if (sequence === 0 && control.ready)
        await Promise.race([control.ready(), interrupted.promise]);
      control.signal?.throwIfAborted();
      const size = Math.min(STAGE_CHUNK_BYTES, options.size - sent);
      if (size === 0) await source.complete();
      await writeBytes(
        socket,
        encodeData({ ...credit, kind: size === 0 ? "finish" : "chunk", size }),
      );
      if (size === 0) break;
      bytes ??= new Uint8Array(STAGE_CHUNK_BYTES);
      const view = bytes.subarray(0, size);
      await source.readInto(view);
      await writeBytes(socket, view);
      hash.update(view);
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
      throw new Error("Invalid file upload seal acknowledgement");
    await endSocket(socket);
    control.signal?.throwIfAborted();
    result = { sizeBytes: sent, sha256 };
  } catch (error) {
    errors.push(error);
  } finally {
    socket.destroy();
    await closed.promise;
    control.signal?.removeEventListener("abort", abort);
  }
  if (socketError && !errors.includes(socketError)) errors.push(socketError);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(errors, "File upload and socket cleanup failed", {
      cause: errors[0],
    });
  if (!result) throw new Error("File upload completion was not acknowledged");
  return result;
}
