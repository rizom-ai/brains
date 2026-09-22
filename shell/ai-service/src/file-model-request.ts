import { z } from "@brains/utils/zod";
import { jsonObjectSchema, jsonValueSchema } from "@brains/contracts";
import type { wrapLanguageModel } from "ai";

type Model = Parameters<typeof wrapLanguageModel>[0]["model"];
export type FileModelCall = Parameters<Model["doGenerate"]>[0];
const options = z.record(z.string(), jsonObjectSchema).exactOptional();
const provider = { providerOptions: options };
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
const url = z
  .url()
  .refine(
    (value) => /^(https?:|brains-upload:)/.test(value),
    "File model input requires a scoped upload reference or HTTP(S) URL",
  );
const file = z.strictObject({
  type: z.literal("file"),
  filename: z.string().exactOptional(),
  data: url.transform((value) => new URL(value)),
  mediaType: z.string(),
  ...provider,
});
const toolContent = z.union([
  text,
  z.strictObject({ type: z.enum(["file-url", "image-url"]), url, ...provider }),
  z.strictObject({
    type: z.enum(["file-id", "image-file-id"]),
    fileId: z.union([z.string(), z.record(z.string(), z.string())]),
    ...provider,
  }),
  z.strictObject({ type: z.literal("custom"), ...provider }),
]);
const toolOutput = z.union([
  z.strictObject({
    type: z.enum(["text", "error-text"]),
    value: z.string(),
    ...provider,
  }),
  z.strictObject({
    type: z.enum(["json", "error-json"]),
    value: jsonValueSchema,
    ...provider,
  }),
  z.strictObject({
    type: z.literal("execution-denied"),
    reason: z.string().exactOptional(),
    ...provider,
  }),
  z.strictObject({ type: z.literal("content"), value: z.array(toolContent) }),
]);
const toolResult = z.strictObject({
  type: z.literal("tool-result"),
  toolCallId: z.string(),
  toolName: z.string(),
  output: toolOutput,
  ...provider,
});
const toolCall = z.strictObject({
  type: z.literal("tool-call"),
  toolCallId: z.string(),
  toolName: z.string(),
  input: jsonValueSchema,
  providerExecuted: z.boolean().exactOptional(),
  ...provider,
});
const approval = z.strictObject({
  type: z.literal("tool-approval-response"),
  approvalId: z.string(),
  approved: z.boolean(),
  reason: z.string().exactOptional(),
  ...provider,
});
const prompt = z.array(
  z.union([
    z.strictObject({
      role: z.literal("system"),
      content: z.string(),
      ...provider,
    }),
    z.strictObject({
      role: z.literal("user"),
      content: z.array(z.union([text, file])),
      ...provider,
    }),
    z.strictObject({
      role: z.literal("assistant"),
      content: z.array(z.union([text, file, reasoning, toolCall, toolResult])),
      ...provider,
    }),
    z.strictObject({
      role: z.literal("tool"),
      content: z.array(z.union([toolResult, approval])),
      ...provider,
    }),
  ]),
);
const callSchema = z.strictObject({
  prompt,
  maxOutputTokens: z.number().int().positive().exactOptional(),
  temperature: z.number().exactOptional(),
  topP: z.number().exactOptional(),
  topK: z.number().exactOptional(),
  presencePenalty: z.number().exactOptional(),
  frequencyPenalty: z.number().exactOptional(),
  seed: z.number().exactOptional(),
  stopSequences: z.array(z.string()).exactOptional(),
  responseFormat: z
    .union([
      z.strictObject({ type: z.literal("text") }),
      z.strictObject({
        type: z.literal("json"),
        schema: jsonObjectSchema.exactOptional(),
        name: z.string().exactOptional(),
        description: z.string().exactOptional(),
      }),
    ])
    .exactOptional(),
  tools: z
    .array(
      z.union([
        z.strictObject({
          type: z.literal("function"),
          name: z.string(),
          description: z.string().exactOptional(),
          inputSchema: jsonObjectSchema,
          inputExamples: z
            .array(z.strictObject({ input: jsonObjectSchema }))
            .exactOptional(),
          strict: z.boolean().exactOptional(),
          ...provider,
        }),
        z.strictObject({
          type: z.literal("provider"),
          id: z.templateLiteral([z.string(), ".", z.string()]),
          name: z.string(),
          args: jsonObjectSchema,
        }),
      ]),
    )
    .exactOptional(),
  toolChoice: z
    .union([
      z.strictObject({ type: z.enum(["auto", "none", "required"]) }),
      z.strictObject({ type: z.literal("tool"), toolName: z.string() }),
    ])
    .exactOptional(),
  // Raw provider chunks can contain encoded files. They are not a control wire.
  includeRawChunks: z.literal(false).exactOptional(),
  headers: z.record(z.string(), z.string()).exactOptional(),
  ...provider,
});

/** Parse the actual SDK v3 call shape, not a second tool loop or a text-only approximation. */
export function decodeFileModelCall(value: unknown): FileModelCall {
  return callSchema.parse(value);
}
