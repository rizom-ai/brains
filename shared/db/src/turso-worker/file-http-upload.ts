import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { createHash } from "node:crypto";
import { isAbsolute } from "node:path";
import { z } from "@brains/utils/zod";
import { remoteUrlSchema } from "./file-fetch";
import { blobFactsSchema, type BlobFacts } from "./blob-protocol";
import { STAGE_CHUNK_BYTES } from "./binary-protocol";
import { withFileSource, type FileChunkSource } from "./file-source";

export interface FileHttpUploadInput {
  sourceFile: string;
  facts: BlobFacts;
  url: string;
  headers: Record<string, string>;
}
export type FileHttpMethod = "PUT" | "POST";
export interface FileHttpUploadRequest {
  method: FileHttpMethod;
  input: FileHttpUploadInput;
}
export interface FileHttpUploadResult extends BlobFacts {
  statusCode: number;
}
export const fileHttpStatusSchema: z.ZodNumber = z
  .number()
  .int()
  .min(200)
  .max(599);
const reservedHeaders = new Set([
  "content-length",
  "transfer-encoding",
  "connection",
  "host",
  "trailer",
  "expect",
  "upgrade",
]);
export const fileHttpUploadSchema: z.ZodType<FileHttpUploadInput> =
  z.strictObject({
    sourceFile: z
      .string()
      .min(1)
      .max(4096)
      .refine((path) => isAbsolute(path) && !path.includes("\0")),
    facts: blobFactsSchema,
    url: remoteUrlSchema,
    headers: z
      .record(
        z
          .string()
          .min(1)
          .max(64)
          .regex(/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/),
        z
          .string()
          .max(4096)
          .refine((value) =>
            [...value].every((character) => {
              const code = character.charCodeAt(0);
              return code === 9 || (code >= 32 && code !== 127 && code <= 255);
            }),
          ),
      )
      .refine((headers) => {
        const entries = Object.entries(headers);
        const names = entries.map(([name]) => name.toLowerCase());
        return (
          entries.length <= 16 &&
          new Set(names).size === names.length &&
          !names.some((name) => reservedHeaders.has(name)) &&
          entries.reduce(
            (size, [name, value]) => size + name.length + value.length,
            0,
          ) <= 8192
        );
      }, "HTTP upload headers exceed their bounds or override transport framing"),
  });

export const fileHttpUploadRequestSchema: z.ZodType<FileHttpUploadRequest> =
  z.strictObject({
    method: z.enum(["PUT", "POST"]),
    input: fileHttpUploadSchema,
  });

export function putFile(
  input: FileHttpUploadInput,
  signal?: AbortSignal,
): Promise<FileHttpUploadResult> {
  return uploadHttpFile({ method: "PUT", input }, signal);
}
export function postFile(
  input: FileHttpUploadInput,
  signal?: AbortSignal,
): Promise<FileHttpUploadResult> {
  return uploadHttpFile({ method: "POST", input }, signal);
}

/** Actor-only, single-attempt HTTP(S) PUT or POST. The caller admits the actor before
 * invocation and owns the file through settlement. One serial <=32 KiB write
 * credit; Node/TLS/kernel buffering and RSS are not established by this bound.
 * Status is metadata, not permission to replay: redirects are returned, never
 * followed. Private/loopback destinations remain reachable. Cancellation or a
 * digest failure cannot retract bytes already submitted to the remote server.
 */
export async function uploadHttpFile(
  input: FileHttpUploadRequest,
  signal?: AbortSignal,
): Promise<FileHttpUploadResult> {
  signal?.throwIfAborted();
  const { input: options, method } = fileHttpUploadRequestSchema.parse(input);
  return withFileSource(
    { path: options.sourceFile, sizeBytes: options.facts.sizeBytes },
    (source) => transfer(options, source, method, signal),
  );
}

async function transfer(
  options: FileHttpUploadInput,
  source: FileChunkSource,
  method: FileHttpMethod,
  signal?: AbortSignal,
): Promise<FileHttpUploadResult> {
  signal?.throwIfAborted();
  const url = new URL(options.url);
  const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
    url,
    {
      method,
      agent: false,
      headers: {
        ...options.headers,
        "content-length": String(options.facts.sizeBytes),
      },
    },
  );
  const incoming = Promise.withResolvers<IncomingMessage>();
  const interrupted = Promise.withResolvers<never>();
  // These gates can reject while a native file read is still being joined.
  void incoming.promise.catch(() => undefined);
  void interrupted.promise.catch(() => undefined);
  const closed = Promise.withResolvers<void>();
  const retirements: Promise<void>[] = [closed.promise];
  const errors: unknown[] = [];
  const remember = (error: unknown): void => {
    if (!errors.includes(error)) errors.push(error);
  };
  let response: IncomingMessage | undefined;
  let result: FileHttpUploadResult | undefined;
  const failed = (error: Error): void => {
    remember(error);
    interrupted.reject(error);
    incoming.reject(error);
  };
  request.on("error", failed);
  request.once("socket", (socket) => {
    retirements.push(
      socket.closed
        ? Promise.resolve()
        : new Promise<void>((resolve) => socket.once("close", resolve)),
    );
  });
  request.once("response", (value) => {
    response = value;
    value.on("error", failed);
    retirements.push(
      value.closed
        ? Promise.resolve()
        : new Promise<void>((resolve) => value.once("close", resolve)),
    );
    incoming.resolve(value);
  });
  request.once("close", () => {
    closed.resolve();
    if (!response || !request.writableFinished) {
      const error = new Error(
        "HTTP upload transport closed before acknowledgement",
      );
      interrupted.reject(error);
      incoming.reject(error);
    }
  });
  const abort = (): void => {
    if (result) return; // Late cancellation is not retraction of an observed status.
    remember(signal?.reason);
    interrupted.reject(signal?.reason);
    incoming.reject(signal?.reason);
    request.destroy();
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    const bytes = new Uint8Array(STAGE_CHUNK_BYTES);
    const hash = createHash("sha256");
    let sent = 0;
    while (sent < options.facts.sizeBytes) {
      signal?.throwIfAborted();
      const view = bytes.subarray(
        0,
        Math.min(bytes.length, options.facts.sizeBytes - sent),
      );
      await source.readInto(view);
      signal?.throwIfAborted();
      hash.update(view);
      await Promise.race([
        new Promise<void>((resolve, reject) =>
          request.write(view, (error) => (error ? reject(error) : resolve())),
        ),
        interrupted.promise,
      ]);
      sent += view.length;
    }
    await Promise.race([
      new Promise<void>((resolve) => request.end(resolve)),
      interrupted.promise,
    ]);
    await source.complete();
    if (hash.digest("hex") !== options.facts.sha256)
      throw new Error(
        "HTTP file digest mismatch; submitted bytes cannot be retracted",
      );
    const received = await Promise.race([
      incoming.promise,
      interrupted.promise,
    ]);
    const statusCode = fileHttpStatusSchema.parse(received.statusCode);
    result = { ...options.facts, statusCode };
  } catch (error) {
    remember(error);
  }
  // No response body is needed for a PUT receipt. Retire it rather than buffering
  // an unbounded remote body, and join request, response and actual socket close.
  for (const resource of [response, request]) {
    try {
      resource?.destroy();
    } catch (error) {
      remember(error);
    }
  }
  await closed.promise;
  await Promise.all(retirements);
  signal?.removeEventListener("abort", abort);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1)
    throw new AggregateError(
      errors,
      "HTTP file upload and transport retirement failed",
      { cause: errors[0] },
    );
  if (!result) throw new Error("HTTP file upload has no acknowledged outcome");
  return result;
}
