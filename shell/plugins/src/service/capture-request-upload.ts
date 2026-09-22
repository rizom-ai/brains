import { randomBytes } from "node:crypto";
import { constantTimeEqual } from "@brains/utils/constant-time";
import type { EntityFileAssets } from "@brains/entity-service";
import {
  captureRuntimeUpload,
  type CaptureRuntimeUploadOptions,
} from "./capture-runtime-upload";
import {
  AcknowledgedRuntimeUploadError,
  type RuntimeUploadFileDescription,
  type RuntimeUploadRecord,
  type ScopedRuntimeUploadStore,
} from "./upload-registry";

/** Forward an opaque request body to the existing admitted native capturer.
 * No form parsing, byte reader, payload materialization or controller file write.
 * The loopback endpoint is authenticated and single-use; it is retired before
 * returning the durable acknowledgement. Native/kernel buffering is not bounded
 * by this wrapper. Callers must authorize the request before entering it. */
export async function captureRequestUpload(
  request: Request,
  input: RuntimeUploadFileDescription & { maxBytes: number },
  files: Pick<EntityFileAssets, "withCapturedFile">,
  store: Pick<ScopedRuntimeUploadStore, "saveFile">,
  options?: Pick<CaptureRuntimeUploadOptions, "validateFile">,
): Promise<RuntimeUploadRecord> {
  request.signal.throwIfAborted();
  if (request.bodyUsed || request.body?.locked)
    throw new Error("Request upload body is unavailable");
  if (!files.withCapturedFile)
    throw new Error("File capture is not provisioned");
  const headers = new Headers({ "Content-Type": input.mediaType });
  const cancellation = new AbortController();
  const signal = AbortSignal.any([request.signal, cancellation.signal]);
  const authorization = `Bearer ${randomBytes(32).toString("hex")}`;
  let entered = false;
  let open = true;
  const peer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(incoming): Response {
      if (
        incoming.method !== "GET" ||
        new URL(incoming.url).pathname !== "/capture" ||
        !constantTimeEqual(
          incoming.headers.get("authorization") ?? "",
          authorization,
        )
      )
        return new Response(null, { status: 403 });
      if (!open || entered) {
        cancellation.abort(
          new Error("Request upload source is closed or already entered"),
        );
        return new Response(null, { status: 409 });
      }
      entered = true;
      return new Response(request.body, { headers });
    },
  });
  let saved: RuntimeUploadRecord | undefined;
  const errors: unknown[] = [];
  try {
    saved = await captureRuntimeUpload(
      {
        filename: input.filename,
        mediaType: input.mediaType,
        ...(input.metadata !== undefined && { metadata: input.metadata }),
        source: {
          url: new URL("/capture", peer.url).href,
          authorization,
          maxBytes: input.maxBytes,
        },
      },
      files,
      store,
      {
        signal,
        validateFile: async (file, borrowedSignal): Promise<void> => {
          if (!entered || !open)
            throw new Error("Request upload source was not consumed");
          borrowedSignal.throwIfAborted();
          await options?.validateFile?.(file, borrowedSignal);
        },
      },
    );
  } catch (error) {
    if (error instanceof AcknowledgedRuntimeUploadError) saved = error.record;
    errors.push(error);
  } finally {
    open = false;
    try {
      await peer.stop(true);
    } catch (error) {
      if (!errors.includes(error)) errors.push(error);
    }
  }
  if (errors.length) {
    const failure =
      errors.length === 1
        ? errors[0]
        : new AggregateError(
            errors,
            "Request upload capture and relay retirement failed",
            { cause: errors[0] },
          );
    if (
      failure instanceof AcknowledgedRuntimeUploadError &&
      failure.record === saved
    )
      throw failure;
    if (saved) throw new AcknowledgedRuntimeUploadError(saved, failure);
    throw failure;
  }
  if (!saved) throw new Error("Request upload capture has no saved record");
  return saved;
}
