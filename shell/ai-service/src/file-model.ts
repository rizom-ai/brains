import { wrapLanguageModel, type LanguageModel } from "ai";
import type { EntityFileAssets } from "@brains/entity-service";
import { readBoundedJsonFile } from "@brains/utils/bounded-json-file";
import { z } from "@brains/utils/zod";
import { decodeFileModelCall, type FileModelCall } from "./file-model-request";
import {
  withFileModelRelay,
  type FileModelRelayOutput,
} from "./file-model-relay";
import {
  FILE_MODEL_FRAME_BYTES,
  type FileModelPart,
  type FileModelResult,
} from "./file-model-result";
import type {
  FileModelBinding,
  NativeFileModelReceipt,
} from "./file-model-native";
import type { FileModelProviderConfig } from "./file-model-actor";
import type { AIModelConfig } from "./types";
import { resolveTextProvider } from "./provider-selection";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
type StreamResult = Awaited<ReturnType<Model["doStream"]>>;
const sourceSchema = z.strictObject({
  kind: z.string().min(1).max(64),
  id: z.string().min(1).max(1024),
});
const receiptSchema: z.ZodType<NativeFileModelReceipt> = z.strictObject({
  frames: z.number().int().positive(),
  sizeBytes: z.number().int().nonnegative().max(FILE_MODEL_FRAME_BYTES),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export interface FileModelReference {
  reference: string;
  source: { kind: string; id: string };
  filename: string;
  mediaType: string;
}
export interface FileModelDependencies {
  getFiles(): Pick<EntityFileAssets, "withProducedFile"> | undefined;
  /** Authorization and inspection belong to this injected resolver, not to URLs or paths. */
  withFiles<T>(
    references: FileModelReference[],
    signal: AbortSignal,
    use: (bindings: FileModelBinding[]) => Promise<T>,
  ): Promise<T>;
}

export function fileModelReference(source: { kind: string; id: string }): URL {
  return new URL(
    `brains-upload:${encodeURIComponent(JSON.stringify(sourceSchema.parse(source)))}`,
  );
}

function referencesFor(call: FileModelCall): FileModelReference[] {
  const references = new Map<string, FileModelReference>();
  for (const message of call.prompt) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    for (const part of message.content) {
      if (part.type !== "file") continue;
      if (!(part.data instanceof URL))
        throw new Error("Inline AI file input requires upload migration");
      if (part.data.protocol !== "brains-upload:")
        throw new Error("AI file URLs require retained upload references");
      if (!part.filename)
        throw new Error("Model upload reference has no filename");
      const source = sourceSchema.parse(
        JSON.parse(decodeURIComponent(part.data.pathname)),
      );
      const previous = references.get(part.data.href);
      if (
        previous &&
        (previous.filename !== part.filename ||
          previous.mediaType !== part.mediaType)
      )
        throw new Error("Conflicting model upload metadata");
      references.set(part.data.href, {
        reference: part.data.href,
        source,
        filename: part.filename,
        mediaType: part.mediaType,
      });
    }
  }
  if (references.size > 16) throw new Error("Too many model upload references");
  return [...references.values()];
}

function assertLogical(value: unknown, parents = new Set<object>()): void {
  if (value === null || typeof value !== "object" || value instanceof URL)
    return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer)
    throw new Error("Binary value in model control request");
  if (parents.has(value)) throw new Error("Cyclic model control request");
  if (parents.size >= 128)
    throw new Error("Model control request is too deeply nested");
  parents.add(value);
  for (const child of Object.values(value)) assertLogical(child, parents);
  parents.delete(value);
}

export class AcknowledgedFileModelError extends Error {
  public readonly output: FileModelRelayOutput;
  constructor(output: FileModelRelayOutput, cause: unknown) {
    super("Model response acknowledged but delivery or retirement failed", {
      cause,
    });
    this.output = output;
    this.name = "AcknowledgedFileModelError";
  }
}

function startCall(
  mode: "generate" | "stream",
  config: FileModelProviderConfig,
  call: FileModelCall,
  references: FileModelReference[],
  deps: FileModelDependencies,
): {
  complete: Promise<FileModelResult | undefined>;
  stream: Promise<StreamResult>;
} {
  const abort = new AbortController();
  const signal = call.abortSignal
    ? AbortSignal.any([call.abortSignal, abort.signal])
    : abort.signal;
  const ready = Promise.withResolvers<StreamResult>();
  void ready.promise.catch(() => undefined);
  const channel = new TransformStream<FileModelPart, FileModelPart>();
  const writer = channel.writable.getWriter();
  let acknowledged: FileModelRelayOutput | undefined;
  const writerFailures: unknown[] = [];
  let aborting: Promise<void> | undefined;
  const abortWriter = (): void => {
    aborting ??= writer.abort(signal.reason);
    void aborting.catch((error: unknown) => {
      writerFailures.push(error);
    });
  };
  signal.addEventListener("abort", abortWriter, { once: true });
  const reader = channel.readable.getReader();
  let stopped = false;
  let released = false;
  const releaseReader = (): void => {
    if (!released) {
      released = true;
      reader.releaseLock();
    }
  };
  const stream = new ReadableStream<FileModelPart>({
    async pull(controller): Promise<void> {
      try {
        const item = await reader.read();
        if (stopped) return;
        if (item.done) {
          await complete;
          stopped = true;
          releaseReader();
          controller.close();
        } else controller.enqueue(item.value);
      } catch (error) {
        let failure = error;
        try {
          await complete;
        } catch (joined) {
          failure = joined;
        }
        if (!stopped) {
          stopped = true;
          releaseReader();
          controller.error(failure);
        }
      }
    },
    async cancel(reason: unknown): Promise<void> {
      stopped = true;
      abort.abort(reason ?? new Error("Model stream consumer cancelled"));
      const failures: unknown[] = [];
      try {
        await reader.cancel(reason);
      } catch (error) {
        failures.push(error);
      }
      try {
        await complete;
      } catch (error) {
        if (!failures.includes(error)) failures.push(error);
      }
      try {
        releaseReader();
      } catch (error) {
        if (!failures.includes(error)) failures.push(error);
      }
      if (failures.length === 1) throw failures[0];
      if (failures.length > 1)
        throw new AggregateError(
          failures,
          "Model consumer cancellation and retirement failed",
          { cause: failures[0] },
        );
    },
  });
  const complete = (async (): Promise<FileModelResult | undefined> => {
    const failures: unknown[] = [];
    let output: FileModelRelayOutput | undefined;
    try {
      signal.throwIfAborted();
      const files = deps.getFiles();
      if (!files?.withProducedFile)
        throw new Error("Native AI file model is not provisioned");
      const produce = files.withProducedFile.bind(files);
      output = await deps.withFiles(references, signal, async (bindings) => {
        const metadataCall = { ...call };
        delete metadataCall.abortSignal;
        const request = { mode, config, call: metadataCall, bindings };
        assertLogical(request);
        const body = JSON.stringify(request);
        if (Buffer.byteLength(body) > FILE_MODEL_FRAME_BYTES)
          throw new Error("Model request exceeds its control allowance");
        decodeFileModelCall(JSON.parse(JSON.stringify(metadataCall)));
        const received = await withFileModelRelay(
          mode,
          body,
          async (metadata, relaySignal) => {
            try {
              return await produce(
                undefined,
                async (file, sourceSignal) =>
                  receiptSchema.parse(
                    await readBoundedJsonFile(file.sourceFile, {
                      maxBytes: 64 * 1024,
                      sizeBytes: file.sizeBytes,
                      sha256: file.sha256,
                      signal: sourceSignal,
                    }),
                  ),
                { producer: "file-model", metadata, signal: relaySignal },
              );
            } catch (error) {
              abort.abort(error);
              throw error;
            }
          },
          {
            ready: (headers) =>
              ready.resolve({
                stream,
                response: { headers },
              }),
            part: async (part) => {
              await writer.write(part);
            },
            abort: (reason) => {
              abort.abort(reason);
            },
          },
          signal,
        );
        acknowledged = received;
        return received;
      });
      signal.throwIfAborted();
      if (mode === "stream") {
        for (const part of output.tail) {
          signal.throwIfAborted();
          await writer.write(part);
        }
      } else if (!output.result)
        throw new Error("Missing generated model result");
      await writer.close();
    } catch (error) {
      const failure = acknowledged
        ? new AcknowledgedFileModelError(acknowledged, error)
        : error;
      failures.push(failure);
      abort.abort(failure);
      ready.reject(failure);
    }
    try {
      await aborting;
    } catch (error) {
      if (!failures.includes(error)) failures.push(error);
    }
    for (const error of writerFailures)
      if (!failures.includes(error)) failures.push(error);
    signal.removeEventListener("abort", abortWriter);
    try {
      writer.releaseLock();
    } catch (error) {
      if (!failures.includes(error)) failures.push(error);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(
        failures,
        "File model and result retirement failed",
        { cause: failures[0] },
      );
    return output?.result;
  })();
  void complete.catch(() => undefined);
  return { complete, stream: ready.promise };
}

/** Only attachment-bearing provider calls leave the controller. Text-only calls
 * retain their existing provider, while tool execution stays in the SDK loop. */
export function createFileModel(
  model: LanguageModel,
  config: AIModelConfig,
  deps: FileModelDependencies,
): Model {
  if (typeof model === "string" || model.specificationVersion !== "v3")
    throw new Error("Native attachments require an SDK v3 language model");
  const modelId = config.model ?? model.modelId;
  const provider = resolveTextProvider(modelId).provider;
  const apiKey = config.apiKey?.length
    ? config.apiKey
    : provider === "anthropic"
      ? undefined
      : config.imageApiKey;
  const nativeConfig: FileModelProviderConfig = {
    model: modelId,
    ...(apiKey ? { apiKey } : {}),
  };
  return wrapLanguageModel({
    model,
    middleware: {
      specificationVersion: "v3",
      overrideSupportedUrls: async ({ model: provider }) => {
        const supported = await provider.supportedUrls;
        return {
          ...supported,
          // HTTP file inputs must reach our reference gate without an SDK
          // controller download. Incoming platform URLs are captured first.
          "*/*": [...(supported["*/*"] ?? []), /^(brains-upload:|https?:)/],
        };
      },
      wrapGenerate: async ({ params, doGenerate }) => {
        const references = referencesFor(params);
        if (!references.length) return doGenerate();
        const result = await startCall(
          "generate",
          nativeConfig,
          params,
          references,
          deps,
        ).complete;
        if (!result) throw new Error("Missing generated model result");
        return result;
      },
      wrapStream: async ({ params, doStream }) => {
        const references = referencesFor(params);
        if (!references.length) return doStream();
        return startCall("stream", nativeConfig, params, references, deps)
          .stream;
      },
    },
  });
}
