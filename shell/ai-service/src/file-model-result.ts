import { z } from "@brains/utils/zod";
import { jsonObjectSchema, jsonValueSchema } from "@brains/contracts";
import {
  errorSchema,
  serializeError,
  deserializeError,
} from "@brains/db/error-protocol";
import type { wrapLanguageModel } from "ai";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
export type FileModelResult = Awaited<ReturnType<Model["doGenerate"]>>;
type ModelStream = Awaited<ReturnType<Model["doStream"]>>["stream"];
export type FileModelPart =
  ModelStream extends ReadableStream<infer Part> ? Part : never;

/** Logical model results only. Source bytes and SDK request/response bodies never enter this wire. */
export const FILE_MODEL_FRAME_BYTES: number = 16 * 1024 * 1024;
const metadata = z.record(z.string(), jsonObjectSchema).exactOptional();
const provider = { providerMetadata: metadata };
const text = z.strictObject({
  type: z.literal("text"),
  text: z.string(),
  ...provider,
});
const reasoning = z.strictObject({
  type: z.literal("reasoning"),
  text: z.string(),
  ...provider,
});
const toolCall = z.strictObject({
  type: z.literal("tool-call"),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.string(),
  providerExecuted: z.boolean().exactOptional(),
  dynamic: z.boolean().exactOptional(),
  ...provider,
});
const toolResult = z.strictObject({
  type: z.literal("tool-result"),
  toolCallId: z.string(),
  toolName: z.string(),
  result: jsonValueSchema.refine((value) => value !== null),
  isError: z.boolean().exactOptional(),
  preliminary: z.boolean().exactOptional(),
  dynamic: z.boolean().exactOptional(),
  ...provider,
});
const approval = z.strictObject({
  type: z.literal("tool-approval-request"),
  approvalId: z.string(),
  toolCallId: z.string(),
  ...provider,
});
const source = z.union([
  z.strictObject({
    type: z.literal("source"),
    sourceType: z.literal("url"),
    id: z.string(),
    url: z.string(),
    title: z.string().exactOptional(),
    ...provider,
  }),
  z.strictObject({
    type: z.literal("source"),
    sourceType: z.literal("document"),
    id: z.string(),
    mediaType: z.string(),
    title: z.string(),
    filename: z.string().exactOptional(),
    ...provider,
  }),
]);
const content = z.union([
  text,
  reasoning,
  toolCall,
  toolResult,
  approval,
  source,
]);
const warnings = z.array(
  z.union([
    z.strictObject({
      type: z.enum(["unsupported", "compatibility"]),
      feature: z.string(),
      details: z.string().exactOptional(),
    }),
    z.strictObject({ type: z.literal("other"), message: z.string() }),
  ]),
);
const tokens = z.number().int().nonnegative().exactOptional();
const usage = z.strictObject({
  inputTokens: z
    .strictObject({
      total: tokens,
      noCache: tokens,
      cacheRead: tokens,
      cacheWrite: tokens,
    })
    .transform((value) => ({
      total: value.total,
      noCache: value.noCache,
      cacheRead: value.cacheRead,
      cacheWrite: value.cacheWrite,
    })),
  outputTokens: z
    .strictObject({ total: tokens, text: tokens, reasoning: tokens })
    .transform((value) => ({
      total: value.total,
      text: value.text,
      reasoning: value.reasoning,
    })),
  raw: jsonObjectSchema.exactOptional(),
});
const finishReason = z
  .strictObject({
    unified: z.enum([
      "stop",
      "length",
      "content-filter",
      "tool-calls",
      "error",
      "other",
    ]),
    raw: z.string().exactOptional(),
  })
  .transform((value) => ({ unified: value.unified, raw: value.raw }));
const responseFields = {
  id: z.string().exactOptional(),
  modelId: z.string().exactOptional(),
  timestamp: z
    .union([z.date(), z.iso.datetime().transform((value) => new Date(value))])
    .exactOptional(),
};
const resultSchema = z.strictObject({
  content: z.array(content),
  finishReason,
  usage,
  warnings,
  ...provider,
  response: z
    .strictObject({
      ...responseFields,
      headers: z.record(z.string(), z.string()).exactOptional(),
    })
    .exactOptional(),
});
const partSchema = z.union([
  z.strictObject({
    type: z.enum([
      "text-start",
      "text-end",
      "reasoning-start",
      "reasoning-end",
      "tool-input-end",
    ]),
    id: z.string(),
    ...provider,
  }),
  z.strictObject({
    type: z.enum(["text-delta", "reasoning-delta", "tool-input-delta"]),
    id: z.string(),
    delta: z.string(),
    ...provider,
  }),
  z.strictObject({
    type: z.literal("tool-input-start"),
    id: z.string(),
    toolName: z.string(),
    providerExecuted: z.boolean().exactOptional(),
    dynamic: z.boolean().exactOptional(),
    title: z.string().exactOptional(),
    ...provider,
  }),
  toolCall,
  toolResult,
  approval,
  source,
  z.strictObject({ type: z.literal("stream-start"), warnings }),
  z.strictObject({ type: z.literal("response-metadata"), ...responseFields }),
  z.strictObject({
    type: z.literal("finish"),
    usage,
    finishReason,
    ...provider,
  }),
  z
    .strictObject({ type: z.literal("error"), error: errorSchema })
    .transform((value) => ({
      type: value.type,
      error: deserializeError(value.error),
    })),
]);

function encode(value: unknown): string {
  const encoded = JSON.stringify(value);
  if (Buffer.byteLength(encoded) > FILE_MODEL_FRAME_BYTES)
    throw new Error("Model result exceeds its control frame limit");
  return encoded;
}
function decode(encoded: string): unknown {
  if (Buffer.byteLength(encoded) > FILE_MODEL_FRAME_BYTES)
    throw new Error("Model result exceeds its control frame limit");
  return JSON.parse(encoded);
}

export function encodeFileModelResult(result: FileModelResult): string {
  // Deliberately do not spread result/response: request.body can contain every
  // input file as base64, and response.body is an untyped provider diagnostic.
  if (result.content.some((part) => part.type === "file"))
    throw new Error("Binary model output requires a separate asset boundary");
  const encoded = encode({
    content: result.content,
    finishReason: result.finishReason,
    usage: result.usage,
    warnings: result.warnings,
    providerMetadata: result.providerMetadata,
    ...(result.response
      ? {
          response: {
            id: result.response.id,
            modelId: result.response.modelId,
            timestamp: result.response.timestamp,
            headers: result.response.headers,
          },
        }
      : {}),
  });
  decodeFileModelResult(encoded);
  return encoded;
}
export function decodeFileModelResult(encoded: string): FileModelResult {
  return resultSchema.parse(decode(encoded));
}
export function encodeFileModelPart(part: FileModelPart): string {
  if (part.type === "file" || part.type === "raw")
    throw new Error(
      "Binary and raw model output require a separate asset boundary",
    );
  const encoded = encode(
    part.type === "error"
      ? { type: part.type, error: serializeError(part.error) }
      : part,
  );
  decodeFileModelPart(encoded);
  return encoded;
}
export function decodeFileModelPart(encoded: string): FileModelPart {
  return partSchema.parse(decode(encoded));
}
