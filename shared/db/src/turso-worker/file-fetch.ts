import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { createHash } from "node:crypto";
import { createGunzip, createInflate, createBrotliDecompress } from "node:zlib";
import type { Readable } from "node:stream";
import { isAbsolute } from "node:path";
import { z } from "@brains/utils/zod";
import { withFileTarget } from "./file-target";
import { STAGE_CHUNK_BYTES, STAGE_BUDGET_BYTES } from "./binary-protocol";
import type { BlobFacts } from "./blob-protocol";

export const remoteUrlSchema: z.ZodType<string> = z
  .string()
  .min(1)
  .max(4096)
  .url()
  .refine((value) => {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password
    );
  });
export const fileFetchSchema: z.ZodType<FileFetchInput> = z.strictObject({
  url: remoteUrlSchema,
  outputFile: z
    .string()
    .min(1)
    .max(4096)
    .refine((path) => isAbsolute(path) && !path.includes("\0")),
});
export interface FileFetchInput {
  url: string;
  outputFile: string;
}
export interface FileFetchObserver<T> {
  /** Validate final response metadata before application reads or file staging. */
  accept(mediaType: string): void;
  /** Borrows a view only until return. Must not retain or mutate it. */
  observe(bytes: Uint8Array): void;
  finish(mediaType: string): T;
}
function available(stream: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    const clean = (): void => {
      stream.off("readable", ready);
      stream.off("end", ready);
      stream.off("close", ready);
      stream.off("error", failed);
    };
    const ready = (): void => {
      clean();
      resolve();
    };
    const failed = (error: Error): void => {
      clean();
      reject(error);
    };
    stream.once("readable", ready);
    stream.once("end", ready);
    stream.once("close", ready);
    stream.once("error", failed);
  });
}
/** Actor-only HTTP file spool. One serial <=32 KiB application read/write credit;
 * size limits apply to decompressed output too. Node/TLS/zlib/kernel buffering
 * and RSS are not established by these logical limits. URL reachability policy
 * is unchanged (including loopback/private addresses); redirects remain HTTP(S).
 */
export async function fetchFile<T>(
  input: FileFetchInput,
  observer: FileFetchObserver<T>,
  signal?: AbortSignal,
): Promise<BlobFacts & { details: T }> {
  const options = fileFetchSchema.parse(input);
  let url = new URL(options.url).href;
  for (let redirects = 0; redirects <= 20; redirects++) {
    signal?.throwIfAborted();
    const request = (url.startsWith("https:") ? httpsRequest : httpRequest)(
      url,
      {
        agent: false,
        signal,
        headers: { "accept-encoding": "gzip, deflate, br" },
      },
    );
    const closed = new Promise<void>((resolve) =>
      request.once("close", resolve),
    );
    let failure: unknown;
    const failed = (error: Error): void => {
      failure ??= error;
    };
    request.on("error", failed);
    let response: IncomingMessage | undefined;
    let body: Readable | undefined;
    let result: (BlobFacts & { details: T }) | undefined;
    const errors: unknown[] = [];
    const remember = (error: unknown): void => {
      if (!errors.includes(error)) errors.push(error);
    };
    try {
      const incoming = new Promise<IncomingMessage>((resolve, reject) => {
        request.once("response", resolve);
        request.once("error", reject);
      });
      request.end();
      response = await incoming;
      response.on("error", failed);
      const status = response.statusCode ?? 0;
      if (
        [301, 302, 303, 307, 308].includes(status) &&
        response.headers.location
      ) {
        if (redirects === 20)
          throw new Error("Image fetch exceeded redirect limit");
        url = remoteUrlSchema.parse(
          new URL(response.headers.location, url).href,
        );
      } else {
        if (status < 200 || status >= 300)
          throw new Error(`Failed to fetch: ${status}`);
        const mediaType =
          response.headers["content-type"]?.split(";")[0]?.toLowerCase() ?? "";
        observer.accept(mediaType);
        const length = response.headers["content-length"];
        if (
          length !== undefined &&
          (!/^\d+$/.test(length) || Number(length) > STAGE_BUDGET_BYTES)
        )
          throw new Error("Image exceeds its size limit");
        const encoding = response.headers["content-encoding"]?.toLowerCase();
        const decoder =
          encoding === "gzip"
            ? createGunzip()
            : encoding === "deflate"
              ? createInflate()
              : encoding === "br"
                ? createBrotliDecompress()
                : undefined;
        if (encoding && encoding !== "identity" && !decoder)
          throw new Error("Unsupported image content encoding");
        body = decoder ?? response;
        body.on("error", failed);
        if (decoder) {
          response.on("error", (error) => decoder.destroy(error));
          response.pipe(decoder);
        }
        const stream = body;
        result = await withFileTarget(
          { path: options.outputFile, maxBytes: STAGE_BUDGET_BYTES },
          async (target) => {
            let sizeBytes = 0;
            const hash = createHash("sha256");
            while (!stream.readableEnded) {
              signal?.throwIfAborted();
              if (failure !== undefined) throw failure;
              if (stream.destroyed)
                throw new Error("Image response ended prematurely");
              const bytes: unknown = stream.read(
                Math.min(
                  STAGE_CHUNK_BYTES,
                  stream.readableLength || STAGE_CHUNK_BYTES,
                ),
              );
              if (bytes === null) {
                await available(stream);
                continue;
              }
              if (!Buffer.isBuffer(bytes) || bytes.length > STAGE_CHUNK_BYTES)
                throw new Error("Image fetch exceeded read credit");
              if (bytes.length > STAGE_BUDGET_BYTES - sizeBytes)
                throw new Error("Image exceeds its size limit");
              observer.observe(bytes);
              hash.update(bytes);
              await target.write(bytes);
              sizeBytes += bytes.length;
            }
            if (failure !== undefined) throw failure;
            return {
              sizeBytes,
              sha256: hash.digest("hex"),
              details: observer.finish(mediaType),
            };
          },
          signal,
        );
      }
    } catch (error) {
      remember(error);
    }
    // Retire each owned transport even if another teardown fails. Keep the
    // operation's primary cause instead of replacing it in a finally block.
    for (const resource of new Set([body, response, request])) {
      try {
        resource?.destroy();
      } catch (error) {
        remember(error);
      }
    }
    await closed;
    if (result && failure !== undefined) remember(failure);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        "Image fetch and transport retirement failed",
        { cause: errors[0] },
      );
    if (result) return result;
  }
  throw new Error("Image fetch exceeded redirect limit");
}
