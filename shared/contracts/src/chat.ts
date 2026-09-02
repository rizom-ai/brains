import { z } from "@brains/utils/zod";
import { agentEventActionSchema, type AgentEventAction } from "./agent-action";

export const CHAT_API_VERSION = 1 as const;
export const DEFAULT_CHAT_API_PATH = "/api/chat" as const;

const chatIdSchema = z.string().trim().min(1).max(256);
const chatUploadIdSchema = z
  .string()
  .regex(
    /^upload-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
const chatTitleSchema = z.string().trim().min(1).max(48);
const chatTimestampSchema = z.string().datetime();
const chatRelativeUrlSchema = z
  .string()
  .regex(/^\/(?!\/)/)
  .max(2_048);
const chatLinkUrlSchema = z
  .string()
  .regex(/^(?:\/(?!\/)|https?:\/\/)/)
  .max(2_048);

type ChatToolApprovalCardState =
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-denied"
  | "output-error";

interface ChatToolApprovalCard {
  [key: string]: unknown;
  kind: "tool-approval";
  id: string;
  toolCallId?: string | undefined;
  toolName: string;
  input?: Record<string, unknown> | undefined;
  summary: string;
  completionSummary?: string | undefined;
  preview?: string | undefined;
  state: ChatToolApprovalCardState;
  output?: unknown;
  error?: string | undefined;
}

const chatToolApprovalCardSchema = z.looseObject({
  kind: z.literal("tool-approval"),
  id: chatIdSchema,
  toolCallId: chatIdSchema.optional(),
  toolName: z.string().trim().min(1).max(256),
  input: z.record(z.string(), z.unknown()).optional(),
  summary: z.string().max(4_096),
  completionSummary: z.string().max(4_096).optional(),
  preview: z.string().max(100_000).optional(),
  state: z.enum([
    "approval-requested",
    "approval-responded",
    "output-available",
    "output-denied",
    "output-error",
  ]),
  output: z.unknown().optional(),
  error: z.string().max(4_096).optional(),
});

interface ChatAttachmentCardSource {
  [key: string]: unknown;
  entityType?: string | undefined;
  entityId?: string | undefined;
  attachmentType?: string | undefined;
}

const chatAttachmentCardSourceSchema: z.ZodType<ChatAttachmentCardSource> =
  z.looseObject({
    entityType: z.string().trim().min(1).max(128).optional(),
    entityId: chatIdSchema.optional(),
    attachmentType: z.string().trim().min(1).max(128).optional(),
  });

interface ChatAttachmentCardData {
  [key: string]: unknown;
  mediaType: string;
  url: string;
  downloadUrl?: string | undefined;
  previewUrl?: string | undefined;
  filename?: string | undefined;
  sizeBytes?: number | undefined;
  source?: ChatAttachmentCardSource | undefined;
}

const chatAttachmentCardDataSchema: z.ZodType<ChatAttachmentCardData> =
  z.looseObject({
    mediaType: z.string().trim().min(1).max(255),
    url: chatLinkUrlSchema,
    downloadUrl: chatLinkUrlSchema.optional(),
    previewUrl: chatLinkUrlSchema.optional(),
    filename: z.string().trim().min(1).max(255).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    source: chatAttachmentCardSourceSchema.optional(),
  });

interface ChatAttachmentCard {
  [key: string]: unknown;
  kind: "attachment";
  id: string;
  jobId?: string | undefined;
  title: string;
  description?: string | undefined;
  attachment: ChatAttachmentCardData;
}

const chatAttachmentCardSchema = z.looseObject({
  kind: z.literal("attachment"),
  id: chatIdSchema,
  jobId: chatIdSchema.optional(),
  title: z.string().max(4_096),
  description: z.string().max(20_000).optional(),
  attachment: chatAttachmentCardDataSchema,
});

interface ChatSourceCitation {
  [key: string]: unknown;
  id: string;
  title?: string | undefined;
  source: string;
  url?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  excerpt?: string | undefined;
  provenance?: Record<string, unknown> | undefined;
}

const chatSourceCitationSchema: z.ZodType<ChatSourceCitation> = z.looseObject({
  id: chatIdSchema,
  title: z.string().max(4_096).optional(),
  source: z.string().trim().min(1).max(512),
  url: chatLinkUrlSchema.optional(),
  entityType: z.string().trim().min(1).max(128).optional(),
  entityId: chatIdSchema.optional(),
  excerpt: z.string().max(20_000).optional(),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

interface ChatSourcesCard {
  [key: string]: unknown;
  kind: "sources";
  id: string;
  title?: string | undefined;
  sources: ChatSourceCitation[];
}

const chatSourcesCardSchema = z.looseObject({
  kind: z.literal("sources"),
  id: chatIdSchema,
  title: z.string().max(4_096).optional(),
  sources: z.array(chatSourceCitationSchema).min(1).max(100),
});

interface ChatPromptAction {
  type: "prompt";
  id: string;
  label: string;
  prompt: string;
  description?: string | undefined;
}

interface ChatSuggestedEventAction {
  type: "event";
  id: string;
  label: string;
  event: string;
  fromState?: string | undefined;
  description?: string | undefined;
}

type ChatSuggestedAction = ChatPromptAction | ChatSuggestedEventAction;

const chatSuggestedActionSchema: z.ZodType<ChatSuggestedAction> =
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("prompt"),
      id: chatIdSchema,
      label: z.string().trim().min(1).max(256),
      prompt: z.string().min(1).max(100_000),
      description: z.string().max(4_096).optional(),
    }),
    z.object({
      type: z.literal("event"),
      id: chatIdSchema,
      label: z.string().trim().min(1).max(256),
      event: z.string().trim().min(1).max(256),
      fromState: z.string().trim().min(1).max(256).optional(),
      description: z.string().max(4_096).optional(),
    }),
  ]);

interface ChatActionsCard {
  [key: string]: unknown;
  kind: "actions";
  id: string;
  title?: string | undefined;
  actions: ChatSuggestedAction[];
}

const chatActionsCardSchema = z.looseObject({
  kind: z.literal("actions"),
  id: chatIdSchema,
  title: z.string().max(4_096).optional(),
  actions: z.array(chatSuggestedActionSchema).min(1).max(100),
});

export type ChatCard =
  ChatToolApprovalCard | ChatAttachmentCard | ChatSourcesCard | ChatActionsCard;

export const chatCardSchema: z.ZodType<ChatCard> = z.discriminatedUnion(
  "kind",
  [
    chatToolApprovalCardSchema,
    chatAttachmentCardSchema,
    chatSourcesCardSchema,
    chatActionsCardSchema,
  ],
);

export type ChatEventAction = AgentEventAction;
export const chatEventActionSchema: typeof agentEventActionSchema =
  agentEventActionSchema;

interface ChatPendingConfirmation {
  id: string;
  toolCallId?: string | undefined;
  toolName: string;
  summary: string;
  completionSummary?: string | undefined;
  preview?: string | undefined;
  args: unknown;
}

const chatPendingConfirmationSchema: z.ZodType<ChatPendingConfirmation> =
  z.object({
    id: chatIdSchema,
    toolCallId: chatIdSchema.optional(),
    toolName: z.string().trim().min(1).max(256),
    summary: z.string().max(4_096),
    completionSummary: z.string().max(4_096).optional(),
    preview: z.string().max(100_000).optional(),
    args: z.unknown(),
  });

interface ChatToolResultError {
  message: string;
  code?: string | undefined;
}

interface ChatToolResult {
  toolName: string;
  args?: Record<string, unknown> | undefined;
  jobId?: string | undefined;
  data?: unknown;
  error?: ChatToolResultError | undefined;
}

const chatToolResultSchema: z.ZodType<ChatToolResult> = z.object({
  toolName: z.string().trim().min(1).max(256),
  args: z.record(z.string(), z.unknown()).optional(),
  jobId: chatIdSchema.optional(),
  data: z.unknown().optional(),
  error: z
    .object({
      message: z.string().max(4_096),
      code: z.string().trim().min(1).max(256).optional(),
    })
    .optional(),
});

interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatActionResponse {
  [key: string]: unknown;
  text: string;
  toolResults?: ChatToolResult[] | undefined;
  cards?: ChatCard[] | undefined;
  pendingConfirmations?: ChatPendingConfirmation[] | undefined;
  usage: ChatUsage;
}

export const chatActionResponseSchema: z.ZodType<ChatActionResponse> =
  z.looseObject({
    text: z.string().max(1_000_000),
    toolResults: z.array(chatToolResultSchema).max(100).optional(),
    cards: z.array(chatCardSchema).max(100).optional(),
    pendingConfirmations: z
      .array(chatPendingConfirmationSchema)
      .max(100)
      .optional(),
    usage: z.object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
    }),
  });

export interface ChatApiPaths {
  stream: string;
  actions: string;
  sessions: string;
  sessionArchive: string;
  messages: string;
  uploads: string;
  contextSessions: string;
  documentAttachments: string;
  imageAttachments: string;
  jobStatus: string;
}

export function createChatApiPaths(
  apiPath: string = DEFAULT_CHAT_API_PATH,
): ChatApiPaths {
  const normalized = normalizeChatApiPath(apiPath);
  return {
    stream: normalized,
    actions: `${normalized}/actions`,
    sessions: `${normalized}/sessions`,
    sessionArchive: `${normalized}/sessions/archive`,
    messages: `${normalized}/messages`,
    uploads: `${normalized}/uploads`,
    contextSessions: `${normalized}/context-sessions`,
    documentAttachments: `${normalized}/attachments/document`,
    imageAttachments: `${normalized}/attachments/image`,
    jobStatus: `${normalized}/jobs/status`,
  };
}

function normalizeChatApiPath(apiPath: string): string {
  const trimmed = apiPath.trim();
  if (
    !trimmed.startsWith("/") ||
    trimmed.startsWith("//") ||
    trimmed.length > 512 ||
    /[\s"'<>\\]/u.test(trimmed) ||
    trimmed.includes("?") ||
    trimmed.includes("#")
  ) {
    throw new Error(
      "Chat API path must be a same-origin absolute path without query or fragment",
    );
  }
  const normalized = trimmed.replace(/\/+$/, "");
  if (normalized.length === 0) {
    throw new Error("Chat API path must not be the site root");
  }
  return normalized;
}

export interface ChatSession {
  [key: string]: unknown;
  id: string;
  title: string;
  lastActiveAt: string;
}

export const chatSessionSchema: z.ZodType<ChatSession> = z.looseObject({
  id: chatIdSchema,
  title: chatTitleSchema,
  lastActiveAt: chatTimestampSchema,
});

export interface ChatSessionsResponse {
  [key: string]: unknown;
  sessions: ChatSession[];
}

export const chatSessionsResponseSchema: z.ZodType<ChatSessionsResponse> =
  z.looseObject({
    sessions: z.array(chatSessionSchema).max(100),
  });

export interface ChatHistoryAttachmentSource {
  [key: string]: unknown;
  kind: string;
  id: string;
}

export const chatHistoryAttachmentSourceSchema: z.ZodType<ChatHistoryAttachmentSource> =
  z.looseObject({
    kind: z.string().trim().min(1).max(64),
    id: chatIdSchema,
  });

export interface ChatHistoryAttachment {
  [key: string]: unknown;
  kind: "text";
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  source?: ChatHistoryAttachmentSource | undefined;
}

export const chatHistoryAttachmentSchema: z.ZodType<ChatHistoryAttachment> =
  z.looseObject({
    kind: z.literal("text"),
    filename: z.string().trim().min(1).max(255),
    mediaType: z.string().trim().min(1).max(255),
    sizeBytes: z.number().int().nonnegative(),
    createdAt: chatTimestampSchema,
    source: chatHistoryAttachmentSourceSchema.optional(),
  });

export interface ChatHistoryMessage {
  [key: string]: unknown;
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: ChatHistoryAttachment[] | undefined;
  cards?: ChatCard[] | undefined;
}

export const chatHistoryMessageSchema: z.ZodType<ChatHistoryMessage> =
  z.looseObject({
    id: chatIdSchema,
    role: z.enum(["user", "assistant"]),
    content: z.string().max(1_000_000),
    attachments: z.array(chatHistoryAttachmentSchema).max(100).optional(),
    cards: z.array(chatCardSchema).max(100).optional(),
  });

export interface ChatMessagesResponse {
  [key: string]: unknown;
  messages: ChatHistoryMessage[];
}

export const chatMessagesResponseSchema: z.ZodType<ChatMessagesResponse> =
  z.looseObject({
    messages: z.array(chatHistoryMessageSchema).max(100),
  });

export interface ChatTextPart {
  type: "text";
  text: string;
}

export const chatTextPartSchema: z.ZodType<ChatTextPart, ChatTextPart> =
  z.object({
    type: z.literal("text"),
    text: z.string().max(1_000_000),
  });

export interface ChatFilePart {
  type: "file";
  mediaType?: string | undefined;
  filename?: string | undefined;
  url: string;
}

export const chatFilePartSchema: z.ZodType<ChatFilePart, ChatFilePart> =
  z.object({
    type: z.literal("file"),
    mediaType: z.string().trim().min(1).max(255).optional(),
    filename: z.string().trim().min(1).max(255).optional(),
    url: z.string().min(1).max(2_000_000),
  });

export interface ChatUploadPartData {
  [key: string]: unknown;
  ref: ChatUploadRef;
}

export interface ChatUploadPart {
  type: "data-upload";
  data: ChatUploadPartData;
}

export const chatUploadPartSchema: z.ZodType<ChatUploadPart> = z.object({
  type: z.literal("data-upload"),
  data: z.looseObject({
    ref: z.object({
      kind: z.literal("upload"),
      id: chatUploadIdSchema,
    }),
  }),
});

export interface ChatApprovalResponse {
  id: string;
  approved: boolean;
  toolCallId?: string | undefined;
  toolName?: string | undefined;
  input?: Record<string, unknown> | undefined;
  title?: string | undefined;
}

export const chatApprovalResponseSchema: z.ZodType<
  ChatApprovalResponse,
  ChatApprovalResponse
> = z.object({
  id: chatIdSchema,
  approved: z.boolean(),
  toolCallId: chatIdSchema.optional(),
  toolName: z.string().trim().min(1).max(256).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  title: z.string().max(4_096).optional(),
});

export interface ChatApprovalResponsePart {
  [key: string]: unknown;
  state: "approval-responded";
  toolCallId?: string | undefined;
  toolName?: string | undefined;
  input?: Record<string, unknown> | undefined;
  title?: string | undefined;
  approval: ChatApprovalResponse;
}

export const chatApprovalResponsePartSchema: z.ZodType<ChatApprovalResponsePart> =
  z.looseObject({
    state: z.literal("approval-responded"),
    toolCallId: chatIdSchema.optional(),
    toolName: z.string().trim().min(1).max(256).optional(),
    input: z.record(z.string(), z.unknown()).optional(),
    title: z.string().max(4_096).optional(),
    approval: chatApprovalResponseSchema,
  });

export type ChatMessageRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id?: string | undefined;
  role: ChatMessageRole;
  parts?: unknown[] | undefined;
  content?: string | undefined;
}

export const chatMessageSchema: z.ZodType<ChatMessage, ChatMessage> = z.object({
  id: chatIdSchema.optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.unknown()).max(1_000).optional(),
  content: z.string().max(1_000_000).optional(),
});

export interface ChatSourceContext {
  sourceId: string;
  itemId: string;
  label: string;
}

const chatSafeText = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));

export const chatSourceContextSchema: z.ZodType<
  ChatSourceContext,
  ChatSourceContext
> = z.strictObject({
  sourceId: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(64),
  itemId: z.string().trim().min(1).max(300),
  label: chatSafeText(160),
});

export interface ChatMessageRequest {
  id?: string | undefined;
  messages: ChatMessage[];
  trigger?: string | undefined;
  inboxContext?: ChatSourceContext | undefined;
}

export const chatMessageRequestSchema: z.ZodType<
  ChatMessageRequest,
  ChatMessageRequest
> = z
  .object({
    id: chatIdSchema.optional(),
    messages: z.array(chatMessageSchema).min(1).max(200),
    trigger: z.string().trim().min(1).max(64).optional(),
    inboxContext: chatSourceContextSchema.optional(),
  })
  .strict();

export interface ChatProgressEvent {
  [key: string]: unknown;
  type: "job" | "batch";
  status: ChatJobStatusValue;
  operationType:
    | "file_operations"
    | "content_operations"
    | "data_processing"
    | "batch_processing";
  operationTarget?: string | undefined;
  message?: string | undefined;
  progress?: { current: number; total: number; percentage: number } | undefined;
}

export const chatProgressEventSchema: z.ZodType<ChatProgressEvent> =
  z.looseObject({
    type: z.enum(["job", "batch"]),
    status: z.enum(["pending", "processing", "completed", "failed"]),
    operationType: z.enum([
      "file_operations",
      "content_operations",
      "data_processing",
      "batch_processing",
    ]),
    operationTarget: z.string().max(1_024).optional(),
    message: z.string().max(4_096).optional(),
    progress: z
      .object({
        current: z.number().nonnegative(),
        total: z.number().nonnegative(),
        percentage: z.number().min(0).max(100),
      })
      .optional(),
  });

export type ChatToolStatusValue =
  "tool-running" | "tool-completed" | "tool-awaiting-approval" | "tool-failed";

export interface ChatToolStatusEvent {
  [key: string]: unknown;
  status: ChatToolStatusValue;
  toolName: string;
  error?: string | undefined;
}

export const chatToolStatusEventSchema: z.ZodType<ChatToolStatusEvent> =
  z.looseObject({
    status: z.enum([
      "tool-running",
      "tool-completed",
      "tool-awaiting-approval",
      "tool-failed",
    ]),
    toolName: z.string().trim().min(1).max(256),
    error: z.string().max(4_096).optional(),
  });

interface ChatProtocolEventBase {
  [key: string]: unknown;
}

type ChatProtocolFinishReason =
  "length" | "error" | "stop" | "content-filter" | "tool-calls" | "other";

type ChatProtocolPayload =
  | { type: "start"; messageId?: string | undefined }
  | { type: "start-step" }
  | { type: "finish-step" }
  | {
      type: "finish";
      finishReason?: ChatProtocolFinishReason | undefined;
    }
  | { type: "abort"; reason?: string | undefined }
  | { type: "error"; errorText: string }
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; delta: string }
  | { type: "text-end"; id: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; delta: string }
  | { type: "reasoning-end"; id: string }
  | {
      type: "tool-input-start";
      toolCallId: string;
      toolName: string;
      title?: string | undefined;
    }
  | { type: "tool-input-delta"; toolCallId: string; inputTextDelta: string }
  | {
      type: "tool-input-available";
      toolCallId: string;
      toolName: string;
      input: unknown;
      title?: string | undefined;
    }
  | {
      type: "tool-input-error";
      toolCallId: string;
      toolName: string;
      input: unknown;
      errorText: string;
      title?: string | undefined;
    }
  | { type: "tool-approval-request"; approvalId: string; toolCallId: string }
  | {
      type: "tool-output-available";
      toolCallId: string;
      output: unknown;
      preliminary?: boolean | undefined;
    }
  | { type: "tool-output-error"; toolCallId: string; errorText: string }
  | { type: "tool-output-denied"; toolCallId: string }
  | {
      type: "source-url";
      sourceId: string;
      url: string;
      title?: string | undefined;
    }
  | {
      type: "source-document";
      sourceId: string;
      mediaType: string;
      title: string;
      filename?: string | undefined;
    }
  | { type: "file"; url: string; mediaType: string }
  | {
      type: "data-progress";
      id?: string | undefined;
      data: ChatProgressEvent;
      transient?: boolean | undefined;
    }
  | {
      type: "data-status";
      id?: string | undefined;
      data: ChatToolStatusEvent;
      transient?: boolean | undefined;
    }
  | {
      type: "data-actions";
      id?: string | undefined;
      data: Extract<ChatCard, { kind: "actions" }>;
      transient?: boolean | undefined;
    }
  | {
      type: "data-sources";
      id?: string | undefined;
      data: Extract<ChatCard, { kind: "sources" }>;
      transient?: boolean | undefined;
    }
  | {
      type: "data-attachment";
      id?: string | undefined;
      data: Extract<ChatCard, { kind: "attachment" }>;
      transient?: boolean | undefined;
    };

export type ChatProtocolEvent = ChatProtocolEventBase & ChatProtocolPayload;

/**
 * Version-1 wire events emitted by the Chat stream. These are transport and
 * server-owned lifecycle facts, not assembled UI messages or host view state.
 */
export const chatProtocolEventSchema: z.ZodType<ChatProtocolEvent> =
  z.discriminatedUnion("type", [
    z.looseObject({
      type: z.literal("start"),
      messageId: chatIdSchema.optional(),
    }),
    z.looseObject({ type: z.literal("start-step") }),
    z.looseObject({ type: z.literal("finish-step") }),
    z.looseObject({
      type: z.literal("finish"),
      finishReason: z
        .enum([
          "length",
          "error",
          "stop",
          "content-filter",
          "tool-calls",
          "other",
        ])
        .optional(),
    }),
    z.looseObject({
      type: z.literal("abort"),
      reason: z.string().max(4_096).optional(),
    }),
    z.looseObject({
      type: z.literal("error"),
      errorText: z.string().max(20_000),
    }),
    z.looseObject({ type: z.literal("text-start"), id: chatIdSchema }),
    z.looseObject({
      type: z.literal("text-delta"),
      id: chatIdSchema,
      delta: z.string().max(1_000_000),
    }),
    z.looseObject({ type: z.literal("text-end"), id: chatIdSchema }),
    z.looseObject({
      type: z.literal("reasoning-start"),
      id: chatIdSchema,
    }),
    z.looseObject({
      type: z.literal("reasoning-delta"),
      id: chatIdSchema,
      delta: z.string().max(1_000_000),
    }),
    z.looseObject({
      type: z.literal("reasoning-end"),
      id: chatIdSchema,
    }),
    z.looseObject({
      type: z.literal("tool-input-start"),
      toolCallId: chatIdSchema,
      toolName: z.string().trim().min(1).max(256),
      title: z.string().max(4_096).optional(),
    }),
    z.looseObject({
      type: z.literal("tool-input-delta"),
      toolCallId: chatIdSchema,
      inputTextDelta: z.string().max(1_000_000),
    }),
    z.looseObject({
      type: z.literal("tool-input-available"),
      toolCallId: chatIdSchema,
      toolName: z.string().trim().min(1).max(256),
      input: z.unknown(),
      title: z.string().max(4_096).optional(),
    }),
    z.looseObject({
      type: z.literal("tool-input-error"),
      toolCallId: chatIdSchema,
      toolName: z.string().trim().min(1).max(256),
      input: z.unknown(),
      errorText: z.string().max(20_000),
      title: z.string().max(4_096).optional(),
    }),
    z.looseObject({
      type: z.literal("tool-approval-request"),
      approvalId: chatIdSchema,
      toolCallId: chatIdSchema,
    }),
    z.looseObject({
      type: z.literal("tool-output-available"),
      toolCallId: chatIdSchema,
      output: z.unknown(),
      preliminary: z.boolean().optional(),
    }),
    z.looseObject({
      type: z.literal("tool-output-error"),
      toolCallId: chatIdSchema,
      errorText: z.string().max(20_000),
    }),
    z.looseObject({
      type: z.literal("tool-output-denied"),
      toolCallId: chatIdSchema,
    }),
    z.looseObject({
      type: z.literal("source-url"),
      sourceId: chatIdSchema,
      url: chatLinkUrlSchema,
      title: z.string().max(4_096).optional(),
    }),
    z.looseObject({
      type: z.literal("source-document"),
      sourceId: chatIdSchema,
      mediaType: z.string().trim().min(1).max(255),
      title: z.string().max(4_096),
      filename: z.string().trim().min(1).max(255).optional(),
    }),
    z.looseObject({
      type: z.literal("file"),
      url: chatLinkUrlSchema,
      mediaType: z.string().trim().min(1).max(255),
    }),
    z.looseObject({
      type: z.literal("data-progress"),
      id: chatIdSchema.optional(),
      data: chatProgressEventSchema,
      transient: z.boolean().optional(),
    }),
    z.looseObject({
      type: z.literal("data-status"),
      id: chatIdSchema.optional(),
      data: chatToolStatusEventSchema,
      transient: z.boolean().optional(),
    }),
    z.looseObject({
      type: z.literal("data-actions"),
      id: chatIdSchema.optional(),
      data: chatActionsCardSchema,
      transient: z.boolean().optional(),
    }),
    z.looseObject({
      type: z.literal("data-sources"),
      id: chatIdSchema.optional(),
      data: chatSourcesCardSchema,
      transient: z.boolean().optional(),
    }),
    z.looseObject({
      type: z.literal("data-attachment"),
      id: chatIdSchema.optional(),
      data: chatAttachmentCardSchema,
      transient: z.boolean().optional(),
    }),
  ]);

export interface ChatContextHandoffRequest {
  version: 1;
  sourceId: string;
  itemId: string;
  titleSeed: string;
}

export const chatContextHandoffRequestSchema: z.ZodType<
  ChatContextHandoffRequest,
  ChatContextHandoffRequest
> = z.strictObject({
  version: z.literal(1),
  sourceId: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(64),
  itemId: z.string().trim().min(1).max(300),
  titleSeed: chatSafeText(160),
});

export interface ChatContextHandoffResponse {
  conversationId: string;
}

export const chatContextHandoffResponseSchema: z.ZodType<
  ChatContextHandoffResponse,
  ChatContextHandoffResponse
> = z.strictObject({
  conversationId: chatIdSchema,
});

export interface RenameChatSessionRequest {
  title: string;
}

export const renameChatSessionRequestSchema: z.ZodType<
  RenameChatSessionRequest,
  RenameChatSessionRequest
> = z
  .object({
    title: chatTitleSchema,
  })
  .strict();

export interface RenameChatSessionResponse {
  renamed: boolean;
  title: string;
}

export const renameChatSessionResponseSchema: z.ZodType<RenameChatSessionResponse> =
  z.object({
    renamed: z.boolean(),
    title: chatTitleSchema,
  });

export interface ArchiveChatSessionResponse {
  archived: boolean;
}

export const archiveChatSessionResponseSchema: z.ZodType<ArchiveChatSessionResponse> =
  z.object({
    archived: z.boolean(),
  });

export interface DeleteChatSessionResponse {
  deleted: boolean;
}

export const deleteChatSessionResponseSchema: z.ZodType<DeleteChatSessionResponse> =
  z.object({
    deleted: z.boolean(),
  });

export interface ChatActionRequest {
  conversationId: string;
  action: ChatEventAction;
}

export const chatActionRequestSchema: z.ZodType<
  ChatActionRequest,
  ChatActionRequest
> = z
  .object({
    conversationId: chatIdSchema,
    action: agentEventActionSchema,
  })
  .strict();

export type ChatJobStatusValue =
  "pending" | "processing" | "completed" | "failed";

export interface ChatJobStatus {
  [key: string]: unknown;
  id: string;
  status: ChatJobStatusValue;
  message?: string | undefined;
}

export const chatJobStatusSchema: z.ZodType<ChatJobStatus> = z.looseObject({
  id: chatIdSchema,
  status: z.enum(["pending", "processing", "completed", "failed"]),
  message: z.string().max(4_096).optional(),
});

export interface ChatUploadRef {
  kind: "upload";
  id: string;
}

export const chatUploadRefSchema: z.ZodType<ChatUploadRef, ChatUploadRef> =
  z.object({
    kind: z.literal("upload"),
    id: chatUploadIdSchema,
  });

export interface ChatUploadResponse {
  [key: string]: unknown;
  id: string;
  ref: ChatUploadRef;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
  downloadUrl: string;
}

export const chatUploadResponseSchema: z.ZodType<ChatUploadResponse> = z
  .looseObject({
    id: chatUploadIdSchema,
    ref: chatUploadRefSchema,
    filename: z.string().trim().min(1).max(255),
    mediaType: z.string().trim().min(1).max(255),
    sizeBytes: z.number().int().nonnegative(),
    createdAt: chatTimestampSchema,
    url: chatRelativeUrlSchema,
    downloadUrl: chatRelativeUrlSchema,
  })
  .refine((upload) => upload.id === upload.ref.id, {
    path: ["ref", "id"],
    message: "Upload response ids must match",
  });

export type ChatFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface ChatClientOptions {
  apiPath?: string | undefined;
  fetch?: ChatFetch | undefined;
  credentials?: RequestCredentials | undefined;
}

export interface ChatClient {
  readonly version: typeof CHAT_API_VERSION;
  readonly paths: ChatApiPaths;
  streamMessages(
    request: ChatMessageRequest,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<Response>;
  listSessions(): Promise<ChatSession[]>;
  getMessages(conversationId: string): Promise<ChatHistoryMessage[]>;
  renameSession(
    conversationId: string,
    title: string,
  ): Promise<RenameChatSessionResponse>;
  archiveSession(conversationId: string): Promise<ArchiveChatSessionResponse>;
  deleteSession(conversationId: string): Promise<DeleteChatSessionResponse>;
  getJobStatus(jobId: string): Promise<ChatJobStatus>;
  openContextSession(
    request: ChatContextHandoffRequest,
  ): Promise<ChatContextHandoffResponse>;
  runAction(request: ChatActionRequest): Promise<ChatActionResponse>;
  upload(file: Blob, filename: string): Promise<ChatUploadResponse>;
  getUploadUrl(uploadId: string, download?: boolean): string;
  getDocumentAttachmentUrl(documentId: string, download?: boolean): string;
  getImageAttachmentUrl(imageId: string, download?: boolean): string;
}

export type ChatApiErrorKind = "http" | "invalid-response";

export class ChatApiError extends Error {
  public readonly operation: string;
  public readonly status: number;
  public readonly kind: ChatApiErrorKind;

  public constructor(
    operation: string,
    status: number,
    kind: ChatApiErrorKind = "http",
  ) {
    super(`Chat API could not ${operation} (${status})`);
    this.name = "ChatApiError";
    this.operation = operation;
    this.status = status;
    this.kind = kind;
  }
}

function parseChatProtocolLine(line: string): ChatProtocolEvent | undefined {
  const normalized = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (!normalized.startsWith("data:")) return undefined;
  const payload = normalized.slice(5).trimStart();
  if (payload.length === 0 || payload === "[DONE]") return undefined;

  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    throw new ChatApiError("read stream", 502, "invalid-response");
  }
  const parsed = chatProtocolEventSchema.safeParse(value);
  if (!parsed.success) {
    throw new ChatApiError("read stream", 502, "invalid-response");
  }
  return parsed.data;
}

/** Decode the versioned SSE protocol without assembling host-owned UI state. */
export async function* readChatProtocolEvents(
  response: Response,
): AsyncGenerator<ChatProtocolEvent> {
  if (!response.ok) {
    throw new ChatApiError("read stream", response.status);
  }
  if (!response.body) {
    throw new ChatApiError("read stream", 502, "invalid-response");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffered += decoder.decode(value, { stream: !done });
      let newline = buffered.indexOf("\n");
      while (newline >= 0) {
        const line = buffered.slice(0, newline);
        buffered = buffered.slice(newline + 1);
        const event = parseChatProtocolLine(line);
        if (event) yield event;
        newline = buffered.indexOf("\n");
      }
      if (done) break;
    }
    if (buffered.length > 0) {
      const event = parseChatProtocolLine(buffered);
      if (event) yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

export function createChatClient(options: ChatClientOptions = {}): ChatClient {
  const paths = createChatApiPaths(options.apiPath);
  const fetchFn = options.fetch ?? globalThis.fetch;
  const credentials = options.credentials ?? "include";

  async function requestJson<T>(
    operation: string,
    url: string,
    schema: z.ZodType<T>,
    init?: RequestInit,
  ): Promise<T> {
    const response = await fetchFn(url, {
      ...init,
      credentials,
    });
    if (!response.ok) {
      throw new ChatApiError(operation, response.status);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ChatApiError(operation, 502, "invalid-response");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ChatApiError(operation, 502, "invalid-response");
    }
    return parsed.data;
  }

  function withId(path: string, id: string): string {
    const parsedId = chatIdSchema.parse(id);
    return `${path}?id=${encodeURIComponent(parsedId)}`;
  }

  function withDownload(path: string, id: string, download: boolean): string {
    const base = withId(path, id);
    return download ? `${base}&download=1` : base;
  }

  return {
    version: CHAT_API_VERSION,
    paths,
    async streamMessages(
      request: ChatMessageRequest,
      streamOptions: { signal?: AbortSignal | undefined } = {},
    ): Promise<Response> {
      const body = chatMessageRequestSchema.parse(request);
      const response = await fetchFn(paths.stream, {
        method: "POST",
        credentials,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...(streamOptions.signal ? { signal: streamOptions.signal } : {}),
      });
      if (!response.ok) {
        throw new ChatApiError("send messages", response.status);
      }
      return response;
    },
    async listSessions(): Promise<ChatSession[]> {
      const response = await requestJson(
        "list sessions",
        paths.sessions,
        chatSessionsResponseSchema,
      );
      return response.sessions;
    },
    async getMessages(conversationId: string): Promise<ChatHistoryMessage[]> {
      const response = await requestJson(
        "load messages",
        withId(paths.messages, conversationId),
        chatMessagesResponseSchema,
      );
      return response.messages;
    },
    async renameSession(
      conversationId: string,
      title: string,
    ): Promise<RenameChatSessionResponse> {
      const body = renameChatSessionRequestSchema.parse({ title });
      return requestJson(
        "rename session",
        withId(paths.sessions, conversationId),
        renameChatSessionResponseSchema,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    },
    async archiveSession(
      conversationId: string,
    ): Promise<ArchiveChatSessionResponse> {
      return requestJson(
        "archive session",
        withId(paths.sessionArchive, conversationId),
        archiveChatSessionResponseSchema,
        { method: "PUT" },
      );
    },
    async deleteSession(
      conversationId: string,
    ): Promise<DeleteChatSessionResponse> {
      return requestJson(
        "delete session",
        withId(paths.sessions, conversationId),
        deleteChatSessionResponseSchema,
        { method: "DELETE" },
      );
    },
    getJobStatus(jobId: string): Promise<ChatJobStatus> {
      return requestJson(
        "load job status",
        withId(paths.jobStatus, jobId),
        chatJobStatusSchema,
      );
    },
    openContextSession(
      request: ChatContextHandoffRequest,
    ): Promise<ChatContextHandoffResponse> {
      return requestJson(
        "open context session",
        paths.contextSessions,
        chatContextHandoffResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(chatContextHandoffRequestSchema.parse(request)),
        },
      );
    },
    runAction(request: ChatActionRequest): Promise<ChatActionResponse> {
      const body = chatActionRequestSchema.parse(request);
      return requestJson(
        "run action",
        paths.actions,
        chatActionResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    },
    async upload(file: Blob, filename: string): Promise<ChatUploadResponse> {
      const normalizedFilename = z
        .string()
        .trim()
        .min(1)
        .max(255)
        .parse(filename);
      const form = new FormData();
      form.set("file", file, normalizedFilename);
      return requestJson(
        "upload file",
        paths.uploads,
        chatUploadResponseSchema,
        {
          method: "POST",
          body: form,
        },
      );
    },
    getUploadUrl(uploadId: string, download = false): string {
      return withDownload(paths.uploads, uploadId, download);
    },
    getDocumentAttachmentUrl(documentId: string, download = false): string {
      return withDownload(paths.documentAttachments, documentId, download);
    },
    getImageAttachmentUrl(imageId: string, download = false): string {
      return withDownload(paths.imageAttachments, imageId, download);
    },
  };
}
