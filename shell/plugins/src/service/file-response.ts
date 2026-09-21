import { randomUUID } from "node:crypto";
import type {
  EntityFileAssets,
  EntityVerifiedFileSource,
} from "@brains/entity-service";
import { MAX_ASSET_BYTES } from "@brains/assets";
import { z } from "@brains/utils/zod";

export interface FileResponseOptions {
  headers: HeadersInit;
  signal: AbortSignal;
  files: Pick<EntityFileAssets, "putHttp">;
  withFile: (
    use: (file: EntityVerifiedFileSource, signal: AbortSignal) => Promise<void>,
    signal: AbortSignal,
  ) => Promise<void>;
  onRetirementError: (error: unknown) => void;
}
const fileSchema = z.strictObject({
  sourceFile: z.string().min(1),
  sizeBytes: z.number().int().nonnegative().max(MAX_ASSET_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
type Outcome = { ok: true } | { ok: false; error: unknown };
async function observe(operation: Promise<void>): Promise<Outcome> {
  try {
    await operation;
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}
/** A credited native PUT feeds a private, single-use loopback receiver. The
 * controller only forwards stream views (at most 32 KiB per enqueue); it never
 * reads/hashes a file or constructs a whole-payload buffer. This is transport,
 * not a public URL or an authorization grant.
 *
 * EOF acknowledges the receiver, then joins the real sender actor and source
 * loan before closing the external body. Cancellation joins the same operation.
 * Constructing/returning Response alone cannot retire the borrowed file.
 */
export async function createFileResponse(
  options: FileResponseOptions,
): Promise<Response> {
  options.signal.throwIfAborted();
  const ready = Promise.withResolvers<Response>();
  const cancelled = new AbortController();
  const requestSignal = AbortSignal.any([options.signal, cancelled.signal]);
  const nativeCompleted = Promise.withResolvers<void>();
  const payloadAccepted = Promise.withResolvers<void>();
  void nativeCompleted.promise.catch(() => undefined); // Joined by the body or scope.
  void payloadAccepted.promise.catch(() => undefined); // Joined by the sender scope.
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let remainder: Uint8Array | undefined;
  let pendingCancel: Promise<Outcome> | undefined;
  let acknowledge: (() => void) | undefined;
  let expected = 0;
  let received = 0;
  const state = { entered: false, consumerSettled: false };
  let closed = false;
  let consumer: Promise<void> | undefined;
  let responseReturned = false;
  const cancelReader = (reason: unknown): void => {
    if (reader && !pendingCancel)
      pendingCancel = observe(reader.cancel(reason));
  };
  const scope: Promise<void> = (async (): Promise<void> => {
    const errors: unknown[] = [];
    const remember = (error: unknown): void => {
      if (!errors.includes(error)) errors.push(error);
    };
    try {
      await options.withFile((input, ownerSignal): Promise<void> => {
        if (state.entered || closed) {
          const error = new Error(
            "HTTP file consumer is closed or already entered",
          );
          remember(error);
          cancelled.abort(error);
          const rejected = Promise.reject<void>(error);
          void rejected.catch(() => undefined); // Provider may ignore the rejected duplicate entry.
          return rejected;
        }
        state.entered = true;
        consumer = (async (): Promise<void> => {
          const transferErrors: unknown[] = [];
          const rememberTransfer = (error: unknown): void => {
            if (!transferErrors.includes(error)) transferErrors.push(error);
          };
          const file = fileSchema.parse(input);
          const signal = AbortSignal.any([requestSignal, ownerSignal]);
          signal.throwIfAborted();
          expected = file.sizeBytes;
          const token = randomUUID();
          const peerReply = Promise.withResolvers<Response>();
          let peerEntered = false;
          const abort = (): void => {
            cancelReader(signal.reason);
            nativeCompleted.reject(signal.reason);
            payloadAccepted.reject(signal.reason);
            peerReply.resolve(new Response(null, { status: 409 }));
          };
          const server = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            idleTimeout: 255,
            maxRequestBodySize: MAX_ASSET_BYTES,
            fetch: (request): Response | Promise<Response> => {
              if (
                peerEntered ||
                signal.aborted ||
                request.method !== "PUT" ||
                request.headers.get("authorization") !== `Bearer ${token}`
              )
                return new Response(null, { status: 404 });
              if (
                (!request.body && file.sizeBytes !== 0) ||
                request.headers.get("content-length") !== String(file.sizeBytes)
              )
                return new Response(null, { status: 400 });
              peerEntered = true;
              reader = (
                request.body ??
                new ReadableStream<Uint8Array>({
                  start(value): void {
                    value.close();
                  },
                })
              ).getReader();
              acknowledge = (): void => {
                peerReply.resolve(new Response(null, { status: 204 }));
              };
              const headers = new Headers(options.headers);
              headers.set("Content-Length", String(file.sizeBytes));
              headers.set("X-Content-Type-Options", "nosniff");
              const body = new ReadableStream<Uint8Array>(
                {
                  start(value): void {
                    controller = value;
                  },
                  async pull(value): Promise<void> {
                    try {
                      signal.throwIfAborted();
                      if (!remainder?.byteLength) {
                        const chunk = await reader?.read();
                        if (!chunk)
                          throw new Error(
                            "HTTP file receiver is not available",
                          );
                        if (chunk.done) {
                          if (received !== expected)
                            throw new Error(
                              "HTTP file response ended at an unexpected size",
                            );
                          acknowledge?.();
                          await scope;
                          value.close();
                          return;
                        }
                        if (chunk.value.byteLength > expected - received)
                          throw new Error(
                            "HTTP file response exceeds its declared size",
                          );
                        received += chunk.value.byteLength;
                        remainder = chunk.value;
                      }
                      const next = remainder.subarray(0, 32 * 1024);
                      remainder = remainder.subarray(next.byteLength);
                      // Withhold the final view until the native receipt and actor
                      // retirement are verified; keep the source loan through handoff.
                      if (received === expected && remainder.byteLength === 0) {
                        const end = await reader?.read();
                        if (!end?.done)
                          throw new Error(
                            "HTTP file receiver has trailing bytes",
                          );
                        acknowledge?.();
                        await nativeCompleted.promise;
                        value.enqueue(next);
                        payloadAccepted.resolve();
                        await scope;
                        value.close();
                      } else value.enqueue(next);
                    } catch (error) {
                      cancelled.abort(error);
                      cancelReader(error);
                      const outcome = await observe(scope);
                      value.error(outcome.ok ? error : outcome.error);
                    }
                  },
                  async cancel(reason): Promise<void> {
                    cancelled.abort(
                      reason ?? new Error("HTTP file response cancelled"),
                    );
                    cancelReader(reason);
                    await scope;
                  },
                },
                { highWaterMark: 0 },
              );
              if (file.sizeBytes === 0) {
                acknowledge();
                payloadAccepted.resolve();
              }
              ready.resolve(
                new Response(file.sizeBytes === 0 ? null : body, { headers }),
              );
              return peerReply.promise;
            },
          });
          signal.addEventListener("abort", abort, { once: true });
          try {
            signal.throwIfAborted();
            const receipt = await options.files.putHttp(
              {
                sourceFile: file.sourceFile,
                facts: { sizeBytes: file.sizeBytes, sha256: file.sha256 },
                url: `http://127.0.0.1:${server.port}/owned-file`,
                headers: {
                  Authorization: `Bearer ${token}`,
                  "Content-Type": "application/octet-stream",
                },
              },
              { signal },
            );
            if (
              receipt.statusCode !== 204 ||
              receipt.sizeBytes !== file.sizeBytes ||
              receipt.sha256 !== file.sha256 ||
              received !== expected
            )
              throw new Error(
                "HTTP file receiver did not acknowledge the complete native transfer",
              );
            nativeCompleted.resolve();
            await payloadAccepted.promise;
          } catch (error) {
            nativeCompleted.reject(error);
            rememberTransfer(error);
            cancelled.abort(error);
            cancelReader(error);
          } finally {
            signal.removeEventListener("abort", abort);
            peerReply.resolve(new Response(null, { status: 409 }));
            if (pendingCancel) {
              const outcome = await pendingCancel;
              if (!outcome.ok) rememberTransfer(outcome.error);
            }
            try {
              reader?.releaseLock();
            } catch (error) {
              rememberTransfer(error);
            }
            try {
              await server.stop(true);
            } catch (error) {
              rememberTransfer(error);
            }
          }
          if (transferErrors.length === 1) throw transferErrors[0];
          if (transferErrors.length > 1)
            throw new AggregateError(
              transferErrors,
              "HTTP file transfer and receiver retirement failed",
              { cause: transferErrors[0] },
            );
        })().finally(() => {
          state.consumerSettled = true;
        });
        // Observe immediately, even if a faulty provider forgets to await entry;
        // the real outcome is joined below before settling the response scope.
        void consumer.catch(() => undefined);
        return consumer;
      }, requestSignal);
      if (!state.entered)
        remember(new Error("HTTP file provider did not enter its consumer"));
      else if (!state.consumerSettled) {
        const error = new Error(
          "HTTP file provider returned before its consumer settled",
        );
        remember(error);
        cancelled.abort(error);
      }
    } catch (error) {
      remember(error);
      cancelled.abort(error);
    } finally {
      closed = true;
    }
    if (consumer) {
      const outcome = await observe(consumer);
      if (!outcome.ok) remember(outcome.error);
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1)
      throw new AggregateError(
        errors,
        "HTTP file consumption and loan retirement failed",
        { cause: errors[0] },
      );
  })().catch((error: unknown): never => {
    if (responseReturned) {
      let reporting: { error: unknown } | undefined;
      try {
        options.onRetirementError(error);
      } catch (reportError) {
        reporting = { error: reportError };
      }
      if (reporting && !Object.is(error, reporting.error))
        throw new AggregateError(
          [error, reporting.error],
          "HTTP file retirement and reporting failed",
          { cause: error },
        );
    }
    throw error;
  });
  // This observer owns asynchronous failures after Response has been returned;
  // cancellation/EOF additionally joins the same scope inside the body methods.
  void scope.catch((error: unknown): void => {
    ready.reject(error);
    controller?.error(error);
  });
  const response = await ready.promise;
  if (expected === 0) await scope;
  responseReturned = true;
  return response;
}
