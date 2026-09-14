import { Socket } from "node:net";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { z } from "@brains/utils/zod";
import {
  binaryReadEndpointSchema,
  binaryReadFactsSchema,
} from "../binary-read";
import { STAGE_CHUNK_BYTES } from "./binary-protocol";
import { readPauseAfterSchema } from "./network-read-protocol";
import {
  DATA_HEADER_BYTES,
  SEAL_BYTES,
  parseDataHeader,
  encodeCredit,
  readFixed,
  readInto,
  writeBytes,
  endSocket,
} from "./network-wire";
import type { BlobFacts } from "./blob-protocol";
import { withFileTarget, type FileChunkTarget } from "./file-target";

export const fileDownloadSchema: z.ZodObject<{
  endpoint: typeof binaryReadEndpointSchema;
  facts: typeof binaryReadFactsSchema;
  outputFile: z.ZodString;
}> = z.strictObject({
  endpoint: binaryReadEndpointSchema,
  facts: binaryReadFactsSchema,
  outputFile: z.string().min(1).max(4096).refine(isAbsolute),
});
export type FileDownloadInput = z.output<typeof fileDownloadSchema>;
export interface FileDownloadControl {
  signal?: AbortSignal;
  pauseAfterBytes?: number;
  ready?: (prefix: BlobFacts) => Promise<void>;
}
/** Actor-only receive/write/hash operation. A successful result includes file
 * publication, not merely a network seal or a close request. No overwrite mode.
 */
export async function downloadFile(
  input: FileDownloadInput,
  control: FileDownloadControl = {},
): Promise<BlobFacts> {
  const options = fileDownloadSchema.parse(input);
  const pauseAfter = readPauseAfterSchema.parse(
    control.pauseAfterBytes ?? STAGE_CHUNK_BYTES,
  );
  return withFileTarget(
    { path: options.outputFile, sizeBytes: options.facts.sizeBytes },
    (target) => receive(target, options, control, pauseAfter),
    control.signal,
  );
}
async function receive(
  target: FileChunkTarget,
  options: FileDownloadInput,
  control: FileDownloadControl,
  pauseAfter: number,
): Promise<BlobFacts> {
  control.signal?.throwIfAborted();
  const socket = new Socket();
  const connected = Promise.withResolvers<void>();
  const closed = Promise.withResolvers<void>();
  const interrupted = Promise.withResolvers<never>();
  void interrupted.promise.catch(() => undefined); // Observed by connection/pause gates and acknowledged cleanup.
  let socketError: Error | undefined;
  socket.once("connect", () => connected.resolve());
  socket.on("error", (error) => {
    socketError ??= error;
    interrupted.reject(error);
  });
  socket.once("close", () => {
    closed.resolve();
    interrupted.reject(socketError ?? new Error("File download socket closed"));
  });
  const abort = (): void => {
    socket.destroy(
      new Error("File download control was cancelled", {
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
    const hash = createHash("sha256");
    let bytes: Uint8Array | undefined;
    let received = 0;
    let sequence = 0;
    let paused = false;
    do {
      control.signal?.throwIfAborted();
      const header = parseDataHeader(
        await readFixed(socket, DATA_HEADER_BYTES),
      );
      if (
        header.sequence !== sequence ||
        header.size > options.facts.sizeBytes - received ||
        (header.kind === "finish" && options.facts.sizeBytes !== 0) ||
        (header.kind === "chunk" && header.size === 0)
      )
        throw new Error("Unexpected file download frame");
      if (header.size > 0) {
        bytes ??= new Uint8Array(STAGE_CHUNK_BYTES);
        const view = bytes.subarray(0, header.size);
        await readInto(socket, view);
        await target.write(view);
        hash.update(view);
        received += header.size;
      }
      if (
        !paused &&
        received >= Math.min(pauseAfter, options.facts.sizeBytes) &&
        control.ready
      ) {
        paused = true;
        await Promise.race([
          control.ready({
            sizeBytes: received,
            sha256: hash.copy().digest("hex"),
          }),
          interrupted.promise,
        ]);
      }
      control.signal?.throwIfAborted();
      await writeBytes(
        socket,
        encodeCredit({ sequence, credit: header.credit }),
      );
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
      throw new Error("File download digest or size mismatch");
    await endSocket(socket);
    control.signal?.throwIfAborted();
    result = { sizeBytes: received, sha256 };
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
    throw new AggregateError(
      errors,
      "File download and socket cleanup failed",
      { cause: errors[0] },
    );
  if (!result) throw new Error("File download completion was not acknowledged");
  return result;
}
