import { dynamicTool, type ToolSet } from "ai";
import { guestInterfaceType } from "@brains/contracts/chat";
import { assertGuestPermission, isGuestToolAllowed } from "./guest-execution";
import type { GuestTurnBudget } from "./guest-turn-budget";
import {
  jsonValueSchema,
  type ActorRef,
  type JsonValue,
  type QueryEmbedding,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { isPlainRecord } from "@brains/utils/predicates";
import type { Tool, ToolContext } from "@brains/mcp-service";
import type { UserPermissionLevel } from "@brains/templates";
import { createToolExecuteWrapper, type ToolEventEmitter } from "./tool-events";
import { definedFields } from "@brains/utils/strip-undefined";

export interface ToolContextInfo {
  conversationId: string;
  channelId?: string | undefined;
  channelName?: string | undefined;
  interfaceType: string;
  actor?: ActorRef | undefined;
  displayName?: string | undefined;
  userPermissionLevel?: UserPermissionLevel;
  isAnchor?: boolean | undefined;
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
    ...definedFields({ source: attachment.source }),
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
  if (!isPlainRecord(result)) return result;
  if (result["success"] !== true) return result;
  return { ...result, cached: true };
}

function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  return jsonValueSchema.parse(JSON.parse(JSON.stringify(value)));
}

export function convertToSDKTools(
  pluginTools: Tool[],
  contextInfo: ToolContextInfo,
  emitter: ToolEventEmitter,
  guestBudget?: GuestTurnBudget,
  queryEmbedding?: QueryEmbedding,
): ToolSet {
  assertGuestPermission(contextInfo);
  const guest = contextInfo.interfaceType === guestInterfaceType;
  if (
    guest &&
    (contextInfo.actor ||
      contextInfo.displayName ||
      contextInfo.enableCreateUpload ||
      contextInfo.enableCreateTransform)
  ) {
    throw new Error("Guest execution denied");
  }
  const sdkTools: ToolSet = {};
  const readCache = new Map<string, unknown>();

  for (const t of pluginTools) {
    if (guest && !isGuestToolAllowed(t)) continue;
    const wrappedExecute = createToolExecuteWrapper(
      t.name,
      async (
        args: unknown,
        options?: {
          toolCallId?: string | undefined;
          abortSignal?: AbortSignal | undefined;
        },
      ) => {
        if (guest && !isGuestToolAllowed(t))
          throw new Error("Guest execution denied");
        if (guest && !guestBudget)
          throw new Error("Guest execution limits required");
        const signal = guestBudget?.signal ?? options?.abortSignal;
        let embeddingUsed = false;
        const context: ToolContext = {
          interfaceType: contextInfo.interfaceType,
          actor: contextInfo.actor ?? {
            kind: "agent",
            agentId: "brain-agent",
          },
          ...(contextInfo.displayName
            ? { displayName: contextInfo.displayName }
            : {}),
          conversationId: contextInfo.conversationId,
          ...(contextInfo.channelId && { channelId: contextInfo.channelId }),
          ...(options?.toolCallId && { toolCallId: options.toolCallId }),
          ...(signal && { signal }),
          ...(contextInfo.channelName && {
            channelName: contextInfo.channelName,
          }),
          ...(contextInfo.userPermissionLevel && {
            userPermissionLevel: contextInfo.userPermissionLevel,
          }),
          ...(contextInfo.isAnchor !== undefined && {
            isAnchor: contextInfo.isAnchor,
          }),
          ...(guest && { userPermissionLevel: "public", isAnchor: false }),
          ...(guest &&
            guestBudget && {
              guestExecution: structuredClone(guestBudget.policy),
              guestQueryEmbedding: async (
                query,
                embeddingSignal,
              ): Promise<Float32Array> => {
                if (
                  t.name !== "system_search" ||
                  !queryEmbedding ||
                  embeddingUsed ||
                  embeddingSignal !== signal
                )
                  throw new Error("Guest query embedding denied");
                embeddingSignal.throwIfAborted();
                embeddingUsed = true;
                return queryEmbedding(query, embeddingSignal);
              },
            }),
        };
        if (t.sideEffects !== "none") {
          if (t.sideEffects === "writes" || t.sideEffects === "external") {
            readCache.clear();
          }
          return t.handler(args, context);
        }

        const cacheKey = `${t.name}:${JSON.stringify(args)}`;
        if (!guest && readCache.has(cacheKey)) {
          return markCachedToolResult(readCache.get(cacheKey));
        }
        let result: unknown;
        try {
          result =
            guest && guestBudget
              ? await guestBudget.executeTool(t.name, args, () =>
                  t.handler(args, context),
                )
              : await t.handler(args, context);
        } catch (error) {
          if (!guest) throw error;
          // Storage/provider exceptions may contain private internals or SQL parameters.
          // Normalize below without retaining a potentially transcript-bearing cause.
          result = undefined;
        }
        if (guest && (!isPlainRecord(result) || result["success"] !== true)) {
          result = { success: false, error: "Public retrieval unavailable" };
        }
        if (!guest) readCache.set(cacheKey, result);
        return result;
      },
      contextInfo,
      // Guest queries and identifiers must not enter general plugin broadcasts.
      guest ? undefined : emitter,
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
