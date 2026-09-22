import {
  fileProduceSchema,
  produceFile,
  type FileProduceInput,
} from "@brains/db/file-produce";
import { serializeError } from "@brains/db/error-protocol";
import { readBoundedJsonResponse } from "@brains/utils/bounded-json-response";
import { z } from "@brains/utils/zod";
import type { wrapLanguageModel } from "ai";
import { createProviderClients, getLanguageModel } from "./provider-clients";
import { decodeFileModelCall } from "./file-model-request";
import { FILE_MODEL_FRAME_BYTES } from "./file-model-result";
import {
  fileModelBindingSchema,
  runNativeFileModel,
  type NativeFileModelReceipt,
} from "./file-model-native";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
export interface FileModelProviderConfig {
  model: string;
  apiKey?: string;
}
export interface FileModelActorDependencies {
  getModel?: (config: FileModelProviderConfig) => Model;
}
const configSchema = z.strictObject({
  model: z.string().min(1),
  apiKey: z.string().exactOptional(),
});
const requestSchema = z.strictObject({
  mode: z.enum(["generate", "stream"]),
  config: configSchema,
  call: z.unknown(),
  bindings: z.array(fileModelBindingSchema).max(16),
});
const receiptSchema: z.ZodType<NativeFileModelReceipt> = z.strictObject({
  frames: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative().max(FILE_MODEL_FRAME_BYTES),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
const relaySchema = z.strictObject({
  url: z
    .url()
    .refine(
      (value) =>
        new URL(value).origin === value &&
        new URL(value).hostname === "127.0.0.1" &&
        new URL(value).protocol === "http:",
    ),
  token: z.string().min(32).max(256),
});

function modelForConfig(config: FileModelProviderConfig): Model {
  const model = getLanguageModel(createProviderClients(config), config.model);
  if (typeof model === "string" || model.specificationVersion !== "v3")
    throw new Error("Native attachments require an SDK v3 language model");
  return model;
}

/** Owned producer implementation. The relay carries logical control data only. */
export async function produceFileModelResult(
  input: FileProduceInput,
  deps: FileModelActorDependencies,
  signal: AbortSignal,
): Promise<{ sizeBytes: number; sha256: string }> {
  const relay = relaySchema.parse(input.metadata);
  return produceFile(
    input,
    async () => {
      const cancellation = new AbortController();
      const scope = AbortSignal.any([signal, cancellation.signal]);
      const headers = { authorization: `Bearer ${relay.token}` };
      const request = requestSchema.parse(
        await readBoundedJsonResponse(
          await fetch(`${relay.url}/request`, {
            headers,
            signal: scope,
            redirect: "error",
          }),
          FILE_MODEL_FRAME_BYTES,
        ),
      );
      scope.throwIfAborted();
      const call = decodeFileModelCall(request.call);
      const model = (deps.getModel ?? modelForConfig)(request.config);
      const channel = new TransformStream<Uint8Array, Uint8Array>();
      const writer = channel.writable.getWriter();
      let closed = false;
      const failures: unknown[] = [];
      const remember = (error: unknown): void => {
        if (!failures.includes(error)) failures.push(error);
      };
      const transmission = fetch(`${relay.url}/response`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/x-ndjson" },
        body: channel.readable,
        signal: scope,
        redirect: "error",
      }).then((response) => {
        if (!closed)
          throw new Error("Model receiver returned before its body completed");
        return response;
      });
      // Retire a blocked writer too when the HTTP peer fails or returns early.
      const observed = transmission.catch(async (error: unknown) => {
        remember(error);
        cancellation.abort(error);
        try {
          await writer.abort(error);
        } catch (failure) {
          remember(failure);
        }
        throw error;
      });
      void observed.catch(() => undefined);
      let receipt: NativeFileModelReceipt | undefined;
      const write = async (frame: string): Promise<void> => {
        const bytes = new TextEncoder().encode(frame);
        for (let offset = 0; offset < bytes.byteLength; offset += 32 * 1024) {
          scope.throwIfAborted();
          await writer.write(bytes.subarray(offset, offset + 32 * 1024));
        }
      };
      try {
        if (request.mode === "generate")
          await write(
            JSON.stringify({ type: "file-model-response", headers: {} }) + "\n",
          );
        receipt = await runNativeFileModel(
          { mode: request.mode, call, bindings: request.bindings },
          model,
          {
            beginStream: async (responseHeaders) =>
              write(
                JSON.stringify({
                  type: "file-model-response",
                  headers: responseHeaders,
                }) + "\n",
              ),
            write,
          },
          scope,
        );
        closed = true;
        await writer.close();
        const acknowledged = receiptSchema.parse(
          await readBoundedJsonResponse(await observed, 64 * 1024),
        );
        if (
          acknowledged.frames !== receipt.frames ||
          acknowledged.sizeBytes !== receipt.sizeBytes ||
          acknowledged.sha256 !== receipt.sha256
        )
          throw new Error("Model response acknowledgement mismatch");
      } catch (error) {
        remember(error);
        cancellation.abort(error);
        try {
          await writer.abort(error);
        } catch (failure) {
          remember(failure);
        }
      }
      try {
        const response = await observed;
        if (!response.bodyUsed) await response.body?.cancel();
      } catch (error) {
        remember(error);
      }
      try {
        writer.releaseLock();
      } catch (error) {
        remember(error);
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw new AggregateError(
          failures,
          "Model invocation and relay retirement failed",
          { cause: failures[0] },
        );
      if (!receipt) throw new Error("Missing native model receipt");
      scope.throwIfAborted();
      return new TextEncoder().encode(JSON.stringify(receipt));
    },
    signal,
  );
}

export function runFileModelActor(
  sidecarUrl: string,
  deps: FileModelActorDependencies = {},
): void {
  const cancellation = new AbortController();
  let started = false;
  if (!process.send) throw new Error("File model requires an IPC owner");
  process.on("disconnect", () =>
    cancellation.abort(new Error("File model owner disconnected")),
  );
  process.on("message", (input: unknown) => {
    if (started) {
      cancellation.abort(new Error("File model already started"));
      return;
    }
    started = true;
    process.send?.({
      kind: "runtime",
      pid: process.pid,
      executable: process.execPath,
      sidecarUrl,
    });
    void (async (): Promise<{ sizeBytes: number; sha256: string }> =>
      produceFileModelResult(
        fileProduceSchema.parse(input),
        deps,
        cancellation.signal,
      ))().then(
      (facts) => {
        process.send?.({ kind: "consumed", pid: process.pid, ...facts });
        process.disconnect();
      },
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
}
