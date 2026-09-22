import { createHash, randomBytes } from "node:crypto";
import { constantTimeEqual } from "@brains/utils/constant-time";
import { z } from "@brains/utils/zod";
import {
  decodeFileModelPart,
  decodeFileModelResult,
  FILE_MODEL_FRAME_BYTES,
  type FileModelPart,
  type FileModelResult,
} from "./file-model-result";
import type { NativeFileModelReceipt } from "./file-model-native";

export interface FileModelRelayOutput {
  receipt: NativeFileModelReceipt;
  result?: FileModelResult;
  tail: FileModelPart[];
}
export class ReceivedFileModelResponseError extends Error {
  public readonly output: FileModelRelayOutput;
  constructor(output: FileModelRelayOutput, cause: unknown) {
    super("Model response received but native completion failed", { cause });
    this.name = "ReceivedFileModelResponseError";
    this.output = output;
  }
}

export interface FileModelRelayConsumer {
  ready(headers: Record<string, string>): void;
  part(part: FileModelPart): Promise<void>;
  abort(reason: unknown): void;
}
const headerSchema = z.strictObject({
  type: z.literal("file-model-response"),
  headers: z.record(z.string(), z.string()),
});

/** Single-use, authenticated logical-control relay. Returning a server Response
 * is not completion: admission and source loans stay with the supplied run(). */
export async function withFileModelRelay(
  mode: "generate" | "stream",
  requestBody: string,
  run: (
    metadata: Record<string, string>,
    signal: AbortSignal,
  ) => Promise<NativeFileModelReceipt>,
  consumer: FileModelRelayConsumer,
  signal?: AbortSignal,
): Promise<FileModelRelayOutput> {
  signal?.throwIfAborted();
  if (Buffer.byteLength(requestBody) > FILE_MODEL_FRAME_BYTES)
    throw new Error("Model request exceeds its control allowance");
  const abort = new AbortController();
  const scope = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
  const authorization = `Bearer ${randomBytes(32).toString("hex")}`;
  let requested = false;
  let entered = false;
  let active = true;
  let completed: FileModelRelayOutput | undefined;
  let receiving: Promise<Response> | undefined;
  const failures: unknown[] = [];
  const remember = (error: unknown): void => {
    if (!failures.includes(error)) failures.push(error);
  };
  const reject = (message: string): Response => {
    const error = new Error(message);
    remember(error);
    abort.abort(error);
    return new Response(null, { status: 409 });
  };
  const receive = async (request: Request): Promise<Response> => {
    const reader = request.body?.getReader();
    let drained = false;
    const errors: unknown[] = [];
    let output: FileModelRelayOutput | undefined;
    try {
      if (!reader) throw new Error("Model response has no control body");
      const decoder = new TextDecoder("utf-8", { fatal: true });
      const hash = createHash("sha256");
      let pending = "";
      let total = 0;
      const state = { headers: false, finished: false };
      let frames = 0;
      let sizeBytes = 0;
      let result: FileModelResult | undefined;
      const tail: FileModelPart[] = [];
      const line = async (encoded: string): Promise<void> => {
        const size = Buffer.byteLength(encoded) + 1;
        if (!state.headers) {
          if (size > 64 * 1024)
            throw new Error("Model headers exceed their metadata allowance");
          const header = headerSchema.parse(JSON.parse(encoded));
          state.headers = true;
          if (mode === "stream") consumer.ready(header.headers);
          return;
        }
        if (state.finished || size > FILE_MODEL_FRAME_BYTES - sizeBytes)
          throw new Error("Invalid terminal or oversized model response");
        hash.update(encoded + "\n");
        sizeBytes += size;
        frames++;
        if (mode === "generate") {
          result = decodeFileModelResult(encoded);
          state.finished = true;
          return;
        }
        const part = decodeFileModelPart(encoded);
        if (part.type === "finish") state.finished = true;
        // Do not submit tool calls or reveal terminal success before native exit
        // and source-loan retirement. Preserve order once the tail begins.
        if (
          tail.length ||
          part.type === "finish" ||
          part.type.startsWith("tool-")
        )
          tail.push(part);
        else await consumer.part(part);
      };
      for (;;) {
        scope.throwIfAborted();
        const item = await reader.read();
        if (item.done) {
          drained = true;
          break;
        }
        total += item.value.byteLength;
        if (total > FILE_MODEL_FRAME_BYTES + 64 * 1024)
          throw new Error("Model control response exceeds its allowance");
        pending += decoder.decode(item.value, { stream: true });
        for (;;) {
          const separator = pending.indexOf("\n");
          if (separator === -1) break;
          const encoded = pending.slice(0, separator);
          pending = pending.slice(separator + 1);
          await line(encoded);
        }
      }
      pending += decoder.decode();
      if (pending || !state.headers || !state.finished)
        throw new Error("Model control response ended before completion");
      output = {
        receipt: { frames, sizeBytes, sha256: hash.digest("hex") },
        tail,
        ...(result ? { result } : {}),
      };
    } catch (error) {
      errors.push(error);
      abort.abort(error);
    }
    if (reader) {
      if (!drained) {
        try {
          await reader.cancel(errors[0]);
        } catch (error) {
          if (!errors.includes(error)) errors.push(error);
        }
      }
      try {
        reader.releaseLock();
      } catch (error) {
        if (!errors.includes(error)) errors.push(error);
      }
    }
    for (const error of errors) remember(error);
    if (errors.length || !output) return new Response(null, { status: 500 });
    completed = output;
    return Response.json(output.receipt);
  };
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0,
    fetch(request): Response | Promise<Response> {
      if (
        !constantTimeEqual(
          request.headers.get("authorization") ?? "",
          authorization,
        )
      )
        return new Response(null, { status: 403 });
      if (!active || scope.aborted) return new Response(null, { status: 410 });
      const path = new URL(request.url).pathname;
      if (path === "/request" && request.method === "GET") {
        if (requested) return reject("Model request relay is already entered");
        requested = true;
        return new Response(requestBody, {
          headers: { "content-type": "application/json" },
        });
      }
      if (path !== "/response" || request.method !== "POST")
        return new Response(null, { status: 404 });
      if (!requested || entered)
        return reject("Model response relay is closed or already entered");
      entered = true;
      receiving = receive(request);
      return receiving;
    },
  });
  let stopping: Promise<void> | undefined;
  const stop = (): void => {
    // Closing HTTP alone cannot release a consumer blocked on SDK backpressure.
    try {
      consumer.abort(scope.reason);
    } catch (error) {
      remember(error);
    }
    stopping ??= server.stop(true);
    void stopping.catch(remember);
  };
  scope.addEventListener("abort", stop, { once: true });
  try {
    const receipt = await run(
      { url: `http://127.0.0.1:${server.port}`, token: authorization.slice(7) },
      scope,
    );
    if (
      receipt.frames !== completed?.receipt.frames ||
      receipt.sizeBytes !== completed.receipt.sizeBytes ||
      receipt.sha256 !== completed.receipt.sha256
    )
      throw new Error(
        "Model actor returned without a verified control response",
      );
  } catch (error) {
    remember(error);
    abort.abort(error);
  }
  active = false;
  try {
    stopping ??= server.stop(true);
    await stopping;
  } catch (error) {
    remember(error);
  }
  try {
    await receiving;
  } catch (error) {
    remember(error);
  }
  scope.removeEventListener("abort", stop);
  if (scope.aborted) remember(scope.reason);
  if (failures.length) {
    const failure =
      failures.length === 1
        ? failures[0]
        : new AggregateError(
            failures,
            "Model call and control relay retirement failed",
            { cause: failures[0] },
          );
    if (completed) throw new ReceivedFileModelResponseError(completed, failure);
    throw failure;
  }
  if (!completed) throw new Error("Missing model response");
  return completed;
}
