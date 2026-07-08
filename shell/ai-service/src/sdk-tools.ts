import { dynamicTool, type ToolSet } from "ai";
import { z } from "@brains/utils/zod";
import type { Tool, ToolContext } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";
import { createToolExecuteWrapper, type ToolEventEmitter } from "./tool-events";

export interface ToolContextInfo {
  conversationId: string;
  channelId?: string | undefined;
  channelName?: string | undefined;
  interfaceType: string;
  userPermissionLevel?: UserPermissionLevel;
  enableCreateUpload?: boolean | undefined;
  enableCreateTransform?: boolean | undefined;
}

const INTERNAL_CONFIRMATION_FIELDS = new Set([
  "confirmed",
  "confirmationToken",
  "contentHash",
]);

const MODEL_HIDDEN_FLAT_CREATE_SOURCE_FIELDS = new Set([
  "content",
  "prompt",
  "url",
  "from",
  "upload",
  "transform",
  "sourceAttachment",
]);

type JsonValue =
  null | string | number | boolean | JsonValue[] | { [key: string]: JsonValue };

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const attachmentToolOutputSchema = z.looseObject({
  success: z.literal(true),
  data: z.looseObject({
    documentId: z.string().min(1).optional(),
    entityId: z.string().min(1).optional(),
    attachment: z.looseObject({
      mediaType: z.string().min(1),
      url: z.string().min(1),
      downloadUrl: z.string().min(1).optional(),
      previewUrl: z.string().min(1).optional(),
      filename: z.string().min(1).optional(),
      sizeBytes: z.number().nonnegative().optional(),
      source: z
        .object({
          entityType: z.string().optional(),
          entityId: z.string().optional(),
          attachmentType: z.string().optional(),
        })
        .optional(),
    }),
  }),
});

type ModelVisibleInputSchema = Record<string, z.ZodType>;

function isModelVisibleInputField(value: unknown): value is z.ZodType {
  return (
    typeof value === "object" &&
    value !== null &&
    "safeParse" in value &&
    typeof value.safeParse === "function"
  );
}

export function toModelVisibleInputSchema(
  inputSchema: Tool["inputSchema"],
  options: {
    toolName?: string;
    enableCreateUpload?: boolean;
    enableCreateTransform?: boolean;
  } = {},
): ModelVisibleInputSchema {
  const visibleSchema: ModelVisibleInputSchema = {};
  for (const [key, schema] of Object.entries(inputSchema)) {
    if (INTERNAL_CONFIRMATION_FIELDS.has(key)) continue;
    if (
      options.toolName === "system_create" &&
      MODEL_HIDDEN_FLAT_CREATE_SOURCE_FIELDS.has(key)
    ) {
      continue;
    }
    if (isModelVisibleInputField(schema)) {
      visibleSchema[key] = schema;
    }
  }
  return visibleSchema;
}

export function toModelToolOutput(output: unknown): {
  type: "json";
  value: JsonValue;
} {
  const parsed = attachmentToolOutputSchema.safeParse(output);
  if (!parsed.success) {
    return { type: "json", value: toJsonValue(output) };
  }

  const { attachment } = parsed.data.data;
  const safeAttachment = {
    mediaType: attachment.mediaType,
    ...(attachment.filename !== undefined
      ? { filename: attachment.filename }
      : {}),
    ...(attachment.sizeBytes !== undefined
      ? { sizeBytes: attachment.sizeBytes }
      : {}),
    ...(attachment.source !== undefined ? { source: attachment.source } : {}),
  };

  return {
    type: "json",
    value: toJsonValue({
      ...parsed.data,
      data: {
        ...parsed.data.data,
        attachment: safeAttachment,
        artifactCard: {
          rendered: true,
          message:
            "The UI has rendered this artifact as an attachment card with Open and Download controls. Do not print raw attachment URLs in the assistant response.",
        },
      },
    }),
  };
}

function markCachedToolResult(result: unknown): unknown {
  if (typeof result !== "object" || result === null || Array.isArray(result)) {
    return result;
  }
  if ((result as { success?: unknown }).success !== true) return result;
  return { ...(result as Record<string, unknown>), cached: true };
}

function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  return jsonValueSchema.parse(JSON.parse(JSON.stringify(value)));
}

export function convertToSDKTools(
  pluginTools: Tool[],
  contextInfo: ToolContextInfo,
  emitter: ToolEventEmitter,
): ToolSet {
  const sdkTools: ToolSet = {};
  const readCache = new Map<string, unknown>();

  for (const t of pluginTools) {
    const wrappedExecute = createToolExecuteWrapper(
      t.name,
      async (args: unknown, options?: { toolCallId?: string | undefined }) => {
        const context: ToolContext = {
          interfaceType: contextInfo.interfaceType,
          userId: "agent-user",
          conversationId: contextInfo.conversationId,
          ...(contextInfo.channelId && { channelId: contextInfo.channelId }),
          ...(options?.toolCallId && { toolCallId: options.toolCallId }),
          ...(contextInfo.channelName && {
            channelName: contextInfo.channelName,
          }),
          ...(contextInfo.userPermissionLevel && {
            userPermissionLevel: contextInfo.userPermissionLevel,
          }),
        };
        if (t.sideEffects !== "none") {
          if (t.sideEffects === "writes" || t.sideEffects === "external") {
            readCache.clear();
          }
          return t.handler(args, context);
        }

        const cacheKey = `${t.name}:${JSON.stringify(args)}`;
        if (readCache.has(cacheKey)) {
          return markCachedToolResult(readCache.get(cacheKey));
        }
        const result = await t.handler(args, context);
        readCache.set(cacheKey, result);
        return result;
      },
      contextInfo,
      emitter,
    );

    sdkTools[t.name] = dynamicTool({
      description: t.description,
      inputSchema: z.object(
        toModelVisibleInputSchema(t.inputSchema, {
          toolName: t.name,
          ...(contextInfo.enableCreateUpload !== undefined && {
            enableCreateUpload: contextInfo.enableCreateUpload,
          }),
          ...(contextInfo.enableCreateTransform !== undefined && {
            enableCreateTransform: contextInfo.enableCreateTransform,
          }),
        }),
      ),
      execute: wrappedExecute,
      toModelOutput: ({ output }) => toModelToolOutput(output),
    });
  }

  return sdkTools;
}
