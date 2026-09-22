import { createHash } from "node:crypto";
import { withFileSource } from "@brains/db/file-source";
import { z } from "@brains/utils/zod";
import type { wrapLanguageModel } from "ai";
import type { FileModelCall } from "./file-model-request";
import {
  encodeFileModelPart,
  encodeFileModelResult,
  FILE_MODEL_FRAME_BYTES,
} from "./file-model-result";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
const MAX_SOURCE_BYTES = 100 * 1024 * 1024;
export interface FileModelBinding {
  reference: string;
  sourceFile: string;
  sizeBytes: number;
  sha256: string;
  mediaType: string;
  filename: string;
}
export const fileModelBindingSchema: z.ZodType<FileModelBinding> =
  z.strictObject({
    reference: z.url().refine((value) => value.startsWith("brains-upload:")),
    sourceFile: z.string().min(1),
    sizeBytes: z.number().int().nonnegative().max(MAX_SOURCE_BYTES),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    mediaType: z.string().min(1),
    filename: z.string().min(1),
  });

export interface NativeFileModelRequest {
  call: FileModelCall;
  bindings: FileModelBinding[];
  mode: "generate" | "stream";
}
export interface NativeFileModelSink {
  /** Only bounded logical headers, never SDK request or raw response bodies. */
  beginStream(headers: Record<string, string>): Promise<void>;
  /** Backpressure must settle before reading another SDK stream part. */
  write(frame: string): Promise<void>;
}
export interface NativeFileModelReceipt {
  frames: number;
  sizeBytes: number;
  sha256: string;
}

/** Native actor only. A path is not authorization: its caller must hold each
 * authorized source loan through actual actor exit. Facts are inspection receipts. */
async function readBinding(
  binding: FileModelBinding,
  signal: AbortSignal,
): Promise<Uint8Array> {
  signal.throwIfAborted();
  return withFileSource(
    { path: binding.sourceFile, sizeBytes: binding.sizeBytes },
    async (source) => {
      const bytes = new Uint8Array(binding.sizeBytes);
      const hash = createHash("sha256");
      for (let offset = 0; offset < bytes.byteLength; offset += 32 * 1024) {
        signal.throwIfAborted();
        const chunk = bytes.subarray(
          offset,
          Math.min(bytes.byteLength, offset + 32 * 1024),
        );
        await source.readInto(chunk);
        hash.update(chunk);
      }
      await source.complete();
      signal.throwIfAborted();
      if (hash.digest("hex") !== binding.sha256)
        throw new Error("Model source digest mismatch");
      return bytes;
    },
  );
}

async function materializePrompt(
  request: NativeFileModelRequest,
  signal: AbortSignal,
): Promise<FileModelCall["prompt"]> {
  const bindings = z
    .array(fileModelBindingSchema)
    .max(16)
    .parse(request.bindings);
  const sources = new Map<string, FileModelBinding>();
  let size = 0;
  for (const binding of bindings) {
    if (sources.has(binding.reference))
      throw new Error("Duplicate model file binding");
    sources.set(binding.reference, binding);
    size += binding.sizeBytes;
    if (size > MAX_SOURCE_BYTES)
      throw new Error("Model sources exceed the binary allowance");
  }
  const bytes = new Map<string, Uint8Array>();
  const prompt: FileModelCall["prompt"] = [];
  for (const message of request.call.prompt) {
    if (message.role !== "user" && message.role !== "assistant") {
      prompt.push(message);
      continue;
    }
    const content: Extract<
      FileModelCall["prompt"][number],
      { role: "assistant" }
    >["content"] = [];
    for (const part of message.content) {
      if (part.type !== "file") {
        content.push(part);
        continue;
      }
      if (!(part.data instanceof URL))
        throw new Error("Unscoped model file bytes");
      if (part.data.protocol !== "brains-upload:") {
        content.push(part);
        continue;
      }
      const reference = part.data.href;
      const binding = sources.get(reference);
      if (
        binding?.mediaType !== part.mediaType ||
        binding.filename !== part.filename
      )
        throw new Error("Model file binding does not match its prompt");
      let data = bytes.get(reference);
      if (!data) {
        data = await readBinding(binding, signal);
        bytes.set(reference, data);
      }
      const mediaType = binding.mediaType.toLowerCase();
      if (mediaType.startsWith("text/") || mediaType === "application/json") {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
        if (text.includes("\0"))
          throw new Error("Model text upload contains NUL");
        content.push({
          type: "text",
          text: `User uploaded a file "${binding.filename}":\n\n${text}`,
          ...(part.providerOptions
            ? { providerOptions: part.providerOptions }
            : {}),
        });
      } else content.push({ ...part, data });
    }
    // Keep the role-specific union: user messages cannot contain tool/reasoning parts.
    if (message.role === "user") {
      const userContent = content.filter(
        (part) => part.type === "text" || part.type === "file",
      );
      if (userContent.length !== content.length)
        throw new Error("Invalid user model content");
      prompt.push({ ...message, content: userContent });
    } else prompt.push({ ...message, content });
  }
  if (bytes.size !== bindings.length)
    throw new Error("Unused model file binding");
  return prompt;
}

/** Exactly one SDK provider invocation. No SDK tool loop, retry, or buffered fallback. */
export async function runNativeFileModel(
  request: NativeFileModelRequest,
  model: Model,
  sink: NativeFileModelSink,
  signal: AbortSignal,
): Promise<NativeFileModelReceipt> {
  if (request.call.includeRawChunks)
    throw new Error("Raw model chunks are not a control wire");
  const prompt = await materializePrompt(request, signal);
  const call = { ...request.call, prompt, abortSignal: signal };
  const hash = createHash("sha256");
  let frames = 0;
  let sizeBytes = 0;
  const write = async (frame: string): Promise<void> => {
    signal.throwIfAborted();
    const size = Buffer.byteLength(frame) + 1;
    if (size > FILE_MODEL_FRAME_BYTES - sizeBytes)
      throw new Error("Model output exceeds its control allowance");
    await sink.write(frame + "\n");
    hash.update(frame + "\n");
    sizeBytes += size;
    frames++;
  };
  signal.throwIfAborted();
  if (request.mode === "generate") {
    await write(encodeFileModelResult(await model.doGenerate(call)));
  } else {
    const result = await model.doStream(call);
    const reader = result.stream.getReader();
    let drained = false;
    let finished = false;
    const failures: unknown[] = [];
    try {
      const headers = z
        .record(z.string(), z.string())
        .parse(result.response?.headers ?? {});
      if (Buffer.byteLength(JSON.stringify(headers)) > 64 * 1024)
        throw new Error(
          "Model response headers exceed their metadata allowance",
        );
      await sink.beginStream(headers);
      for (;;) {
        signal.throwIfAborted();
        const item = await reader.read();
        if (item.done) {
          drained = true;
          break;
        }
        if (finished) throw new Error("Model output continued after finish");
        if (item.value.type === "finish") finished = true;
        await write(encodeFileModelPart(item.value));
      }
      if (!finished) throw new Error("Model stream ended without finish");
    } catch (error) {
      failures.push(error);
    }
    if (!drained) {
      try {
        await reader.cancel(failures[0]);
      } catch (error) {
        if (!failures.includes(error)) failures.push(error);
      }
    }
    try {
      reader.releaseLock();
    } catch (error) {
      if (!failures.includes(error)) failures.push(error);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1)
      throw new AggregateError(failures, "Model stream and retirement failed", {
        cause: failures[0],
      });
  }
  signal.throwIfAborted();
  return { frames, sizeBytes, sha256: hash.digest("hex") };
}
