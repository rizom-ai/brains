import { z } from "@brains/utils/zod";
import { agentEventActionSchema, type AgentEventAction } from "./agent-action";

export const CHAT_API_VERSION = 1 as const;
export const DEFAULT_CHAT_API_PATH = "/api/chat" as const;

type Loose<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$loose>;
type Strict<Shape extends z.ZodRawShape> = z.ZodObject<Shape, z.core.$strict>;

const chatIdSchema: z.ZodString = z.string().trim().min(1).max(256);
const chatUploadIdSchema: z.ZodString = z
  .string()
  .regex(
    /^upload-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
const chatTitleSchema: z.ZodString = z.string().trim().min(1).max(48);
const chatTimestampSchema: z.ZodString = z.string().datetime();
const chatRelativeUrlSchema: z.ZodString = z
  .string()
  .regex(/^\/(?!\/)/)
  .max(2_048);
const chatLinkUrlSchema: z.ZodString = z
  .string()
  .regex(/^(?:\/(?!\/)|https?:\/\/)/)
  .max(2_048);

const chatToolApprovalCardSchema: Loose<{
  kind: z.ZodLiteral<"tool-approval">;
  id: z.ZodString;
  toolCallId: z.ZodOptional<z.ZodString>;
  toolName: z.ZodString;
  input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  summary: z.ZodString;
  completionSummary: z.ZodOptional<z.ZodString>;
  preview: z.ZodOptional<z.ZodString>;
  state: z.ZodEnum<{
    "approval-requested": "approval-requested";
    "approval-responded": "approval-responded";
    "output-available": "output-available";
    "output-denied": "output-denied";
    "output-error": "output-error";
  }>;
  output: z.ZodOptional<z.ZodUnknown>;
  error: z.ZodOptional<z.ZodString>;
}> = z.looseObject({
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

const chatAttachmentCardSourceSchema: Loose<{
  entityType: z.ZodOptional<z.ZodString>;
  entityId: z.ZodOptional<z.ZodString>;
  attachmentType: z.ZodOptional<z.ZodString>;
}> = z.looseObject({
  entityType: z.string().trim().min(1).max(128).optional(),
  entityId: chatIdSchema.optional(),
  attachmentType: z.string().trim().min(1).max(128).optional(),
});

const chatAttachmentCardDataSchema: Loose<{
  mediaType: z.ZodString;
  url: z.ZodString;
  downloadUrl: z.ZodOptional<z.ZodString>;
  previewUrl: z.ZodOptional<z.ZodString>;
  filename: z.ZodOptional<z.ZodString>;
  sizeBytes: z.ZodOptional<z.ZodNumber>;
  source: z.ZodOptional<typeof chatAttachmentCardSourceSchema>;
}> = z.looseObject({
  mediaType: z.string().trim().min(1).max(255),
  url: chatLinkUrlSchema,
  downloadUrl: chatLinkUrlSchema.optional(),
  previewUrl: chatLinkUrlSchema.optional(),
  filename: z.string().trim().min(1).max(255).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  source: chatAttachmentCardSourceSchema.optional(),
});

const chatAttachmentCardSchema: Loose<{
  kind: z.ZodLiteral<"attachment">;
  id: z.ZodString;
  jobId: z.ZodOptional<z.ZodString>;
  title: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  attachment: typeof chatAttachmentCardDataSchema;
}> = z.looseObject({
  kind: z.literal("attachment"),
  id: chatIdSchema,
  jobId: chatIdSchema.optional(),
  title: z.string().max(4_096),
  description: z.string().max(20_000).optional(),
  attachment: chatAttachmentCardDataSchema,
});

const chatSourceCitationSchema: Loose<{
  id: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  source: z.ZodString;
  url: z.ZodOptional<z.ZodString>;
  entityType: z.ZodOptional<z.ZodString>;
  entityId: z.ZodOptional<z.ZodString>;
  excerpt: z.ZodOptional<z.ZodString>;
  provenance: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}> = z.looseObject({
  id: chatIdSchema,
  title: z.string().max(4_096).optional(),
  source: z.string().trim().min(1).max(512),
  url: chatLinkUrlSchema.optional(),
  entityType: z.string().trim().min(1).max(128).optional(),
  entityId: chatIdSchema.optional(),
  excerpt: z.string().max(20_000).optional(),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

const chatSourcesCardSchema: Loose<{
  kind: z.ZodLiteral<"sources">;
  id: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  sources: z.ZodArray<typeof chatSourceCitationSchema>;
}> = z.looseObject({
  kind: z.literal("sources"),
  id: chatIdSchema,
  title: z.string().max(4_096).optional(),
  sources: z.array(chatSourceCitationSchema).min(1).max(100),
});

const chatSuggestedActionSchema: z.ZodDiscriminatedUnion<
  [
    z.ZodObject<{
      type: z.ZodLiteral<"prompt">;
      id: z.ZodString;
      label: z.ZodString;
      prompt: z.ZodString;
      description: z.ZodOptional<z.ZodString>;
    }>,
    z.ZodObject<{
      type: z.ZodLiteral<"event">;
      id: z.ZodString;
      label: z.ZodString;
      event: z.ZodString;
      fromState: z.ZodOptional<z.ZodString>;
      description: z.ZodOptional<z.ZodString>;
    }>,
  ],
  "type"
> = z.discriminatedUnion("type", [
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

const chatActionsCardSchema: Loose<{
  kind: z.ZodLiteral<"actions">;
  id: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  actions: z.ZodArray<typeof chatSuggestedActionSchema>;
}> = z.looseObject({
  kind: z.literal("actions"),
  id: chatIdSchema,
  title: z.string().max(4_096).optional(),
  actions: z.array(chatSuggestedActionSchema).min(1).max(100),
});

export const chatCardSchema: z.ZodDiscriminatedUnion<
  [
    typeof chatToolApprovalCardSchema,
    typeof chatAttachmentCardSchema,
    typeof chatSourcesCardSchema,
    typeof chatActionsCardSchema,
  ],
  "kind"
> = z.discriminatedUnion("kind", [
  chatToolApprovalCardSchema,
  chatAttachmentCardSchema,
  chatSourcesCardSchema,
  chatActionsCardSchema,
]);

export type ChatCard = z.output<typeof chatCardSchema>;

export type ChatEventAction = AgentEventAction;
export const chatEventActionSchema: typeof agentEventActionSchema =
  agentEventActionSchema;

const chatPendingConfirmationSchema: z.ZodObject<{
  id: z.ZodString;
  toolCallId: z.ZodOptional<z.ZodString>;
  toolName: z.ZodString;
  summary: z.ZodString;
  completionSummary: z.ZodOptional<z.ZodString>;
  preview: z.ZodOptional<z.ZodString>;
  args: z.ZodUnknown;
}> = z.object({
  id: chatIdSchema,
  toolCallId: chatIdSchema.optional(),
  toolName: z.string().trim().min(1).max(256),
  summary: z.string().max(4_096),
  completionSummary: z.string().max(4_096).optional(),
  preview: z.string().max(100_000).optional(),
  args: z.unknown(),
});

const chatToolResultSchema: z.ZodObject<{
  toolName: z.ZodString;
  args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  jobId: z.ZodOptional<z.ZodString>;
  data: z.ZodOptional<z.ZodUnknown>;
  error: z.ZodOptional<
    z.ZodObject<{
      message: z.ZodString;
      code: z.ZodOptional<z.ZodString>;
    }>
  >;
}> = z.object({
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

export const chatActionResponseSchema: Loose<{
  text: z.ZodString;
  toolResults: z.ZodOptional<z.ZodArray<typeof chatToolResultSchema>>;
  cards: z.ZodOptional<z.ZodArray<typeof chatCardSchema>>;
  pendingConfirmations: z.ZodOptional<
    z.ZodArray<typeof chatPendingConfirmationSchema>
  >;
  usage: z.ZodObject<{
    promptTokens: z.ZodNumber;
    completionTokens: z.ZodNumber;
    totalTokens: z.ZodNumber;
  }>;
}> = z.looseObject({
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

export type ChatActionResponse = z.output<typeof chatActionResponseSchema>;

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

export const chatContextHandoffRequestSchema: Strict<{
  version: z.ZodLiteral<1>;
  sourceId: z.ZodString;
  itemId: z.ZodString;
  titleSeed: z.ZodString;
}> = z.strictObject({
  version: z.literal(1),
  sourceId: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(64),
  itemId: z.string().trim().min(1).max(300),
  titleSeed: z
    .string()
    .trim()
    .min(1)
    .max(160)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value)),
});

export type ChatContextHandoffRequest = z.output<
  typeof chatContextHandoffRequestSchema
>;

export const chatSessionSchema: Loose<{
  id: z.ZodString;
  title: z.ZodString;
  lastActiveAt: z.ZodString;
  contextHandoff: z.ZodOptional<typeof chatContextHandoffRequestSchema>;
}> = z.looseObject({
  id: chatIdSchema,
  title: chatTitleSchema,
  lastActiveAt: chatTimestampSchema,
  contextHandoff: chatContextHandoffRequestSchema.optional(),
});

export type ChatSession = z.output<typeof chatSessionSchema>;

export const chatSessionsResponseSchema: Loose<{
  sessions: z.ZodArray<typeof chatSessionSchema>;
}> = z.looseObject({
  sessions: z.array(chatSessionSchema).max(100),
});

export type ChatSessionsResponse = z.output<typeof chatSessionsResponseSchema>;

export const chatHistoryAttachmentSourceSchema: Loose<{
  kind: z.ZodString;
  id: z.ZodString;
}> = z.looseObject({
  kind: z.string().trim().min(1).max(64),
  id: chatIdSchema,
});

export type ChatHistoryAttachmentSource = z.output<
  typeof chatHistoryAttachmentSourceSchema
>;

export const chatHistoryAttachmentSchema: Loose<{
  kind: z.ZodLiteral<"text">;
  filename: z.ZodString;
  mediaType: z.ZodString;
  sizeBytes: z.ZodNumber;
  createdAt: z.ZodString;
  source: z.ZodOptional<typeof chatHistoryAttachmentSourceSchema>;
}> = z.looseObject({
  kind: z.literal("text"),
  filename: z.string().trim().min(1).max(255),
  mediaType: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
  createdAt: chatTimestampSchema,
  source: chatHistoryAttachmentSourceSchema.optional(),
});

export type ChatHistoryAttachment = z.output<
  typeof chatHistoryAttachmentSchema
>;

export const chatHistoryMessageSchema: Loose<{
  id: z.ZodString;
  role: z.ZodEnum<{ user: "user"; assistant: "assistant" }>;
  content: z.ZodString;
  attachments: z.ZodOptional<z.ZodArray<typeof chatHistoryAttachmentSchema>>;
  cards: z.ZodOptional<z.ZodArray<typeof chatCardSchema>>;
}> = z.looseObject({
  id: chatIdSchema,
  role: z.enum(["user", "assistant"]),
  content: z.string().max(1_000_000),
  attachments: z.array(chatHistoryAttachmentSchema).max(100).optional(),
  cards: z.array(chatCardSchema).max(100).optional(),
});

export type ChatHistoryMessage = z.output<typeof chatHistoryMessageSchema>;

export const chatMessagesResponseSchema: Loose<{
  messages: z.ZodArray<typeof chatHistoryMessageSchema>;
}> = z.looseObject({
  messages: z.array(chatHistoryMessageSchema).max(100),
});

export type ChatMessagesResponse = z.output<typeof chatMessagesResponseSchema>;

export const chatTextPartSchema: z.ZodObject<{
  type: z.ZodLiteral<"text">;
  text: z.ZodString;
}> = z.object({
  type: z.literal("text"),
  text: z.string().max(1_000_000),
});

export type ChatTextPart = z.output<typeof chatTextPartSchema>;

export const chatFilePartSchema: z.ZodObject<{
  type: z.ZodLiteral<"file">;
  mediaType: z.ZodOptional<z.ZodString>;
  filename: z.ZodOptional<z.ZodString>;
  url: z.ZodString;
}> = z.object({
  type: z.literal("file"),
  mediaType: z.string().trim().min(1).max(255).optional(),
  filename: z.string().trim().min(1).max(255).optional(),
  url: z.string().min(1).max(2_000_000),
});

export type ChatFilePart = z.output<typeof chatFilePartSchema>;

export const chatUploadRefSchema: z.ZodObject<{
  kind: z.ZodLiteral<"upload">;
  id: z.ZodString;
}> = z.object({
  kind: z.literal("upload"),
  id: chatUploadIdSchema,
});

export type ChatUploadRef = z.output<typeof chatUploadRefSchema>;

export const chatUploadPartSchema: z.ZodObject<{
  type: z.ZodLiteral<"data-upload">;
  data: Loose<{ ref: typeof chatUploadRefSchema }>;
}> = z.object({
  type: z.literal("data-upload"),
  data: z.looseObject({ ref: chatUploadRefSchema }),
});

export type ChatUploadPart = z.output<typeof chatUploadPartSchema>;
export type ChatUploadPartData = ChatUploadPart["data"];

export const chatApprovalResponseSchema: z.ZodObject<{
  id: z.ZodString;
  approved: z.ZodBoolean;
  toolCallId: z.ZodOptional<z.ZodString>;
  toolName: z.ZodOptional<z.ZodString>;
  input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  title: z.ZodOptional<z.ZodString>;
}> = z.object({
  id: chatIdSchema,
  approved: z.boolean(),
  toolCallId: chatIdSchema.optional(),
  toolName: z.string().trim().min(1).max(256).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  title: z.string().max(4_096).optional(),
});

export type ChatApprovalResponse = z.output<typeof chatApprovalResponseSchema>;

export const chatApprovalResponsePartSchema: Loose<{
  state: z.ZodLiteral<"approval-responded">;
  toolCallId: z.ZodOptional<z.ZodString>;
  toolName: z.ZodOptional<z.ZodString>;
  input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  title: z.ZodOptional<z.ZodString>;
  approval: typeof chatApprovalResponseSchema;
}> = z.looseObject({
  state: z.literal("approval-responded"),
  toolCallId: chatIdSchema.optional(),
  toolName: z.string().trim().min(1).max(256).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  title: z.string().max(4_096).optional(),
  approval: chatApprovalResponseSchema,
});

export type ChatApprovalResponsePart = z.output<
  typeof chatApprovalResponsePartSchema
>;

export const chatMessageSchema: z.ZodObject<{
  id: z.ZodOptional<z.ZodString>;
  role: z.ZodEnum<{ user: "user"; assistant: "assistant"; system: "system" }>;
  parts: z.ZodOptional<z.ZodArray<z.ZodUnknown>>;
  content: z.ZodOptional<z.ZodString>;
}> = z.object({
  id: chatIdSchema.optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.unknown()).max(1_000).optional(),
  content: z.string().max(1_000_000).optional(),
});

export type ChatMessage = z.output<typeof chatMessageSchema>;
export type ChatMessageRole = ChatMessage["role"];

const chatSafeText = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));

export const chatSourceContextSchema: Strict<{
  sourceId: z.ZodString;
  itemId: z.ZodString;
  label: z.ZodString;
}> = z.strictObject({
  sourceId: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(64),
  itemId: z.string().trim().min(1).max(300),
  label: chatSafeText(160),
});

export type ChatSourceContext = z.output<typeof chatSourceContextSchema>;

export const chatMessageRequestSchema: Strict<{
  id: z.ZodOptional<z.ZodString>;
  messages: z.ZodArray<typeof chatMessageSchema>;
  trigger: z.ZodOptional<z.ZodString>;
  inboxContext: z.ZodOptional<typeof chatSourceContextSchema>;
}> = z
  .object({
    id: chatIdSchema.optional(),
    messages: z.array(chatMessageSchema).min(1).max(200),
    trigger: z.string().trim().min(1).max(64).optional(),
    inboxContext: chatSourceContextSchema.optional(),
  })
  .strict();

export type ChatMessageRequest = z.output<typeof chatMessageRequestSchema>;

const chatJobStatusValueSchema: z.ZodEnum<{
  pending: "pending";
  processing: "processing";
  completed: "completed";
  failed: "failed";
}> = z.enum(["pending", "processing", "completed", "failed"]);

export type ChatJobStatusValue = z.output<typeof chatJobStatusValueSchema>;

export const chatProgressEventSchema: Loose<{
  type: z.ZodEnum<{ job: "job"; batch: "batch" }>;
  status: typeof chatJobStatusValueSchema;
  operationType: z.ZodEnum<{
    file_operations: "file_operations";
    content_operations: "content_operations";
    data_processing: "data_processing";
    batch_processing: "batch_processing";
  }>;
  operationTarget: z.ZodOptional<z.ZodString>;
  message: z.ZodOptional<z.ZodString>;
  progress: z.ZodOptional<
    z.ZodObject<{
      current: z.ZodNumber;
      total: z.ZodNumber;
      percentage: z.ZodNumber;
    }>
  >;
}> = z.looseObject({
  type: z.enum(["job", "batch"]),
  status: chatJobStatusValueSchema,
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

export type ChatProgressEvent = z.output<typeof chatProgressEventSchema>;

export const chatToolStatusEventSchema: Loose<{
  status: z.ZodEnum<{
    "tool-running": "tool-running";
    "tool-completed": "tool-completed";
    "tool-awaiting-approval": "tool-awaiting-approval";
    "tool-failed": "tool-failed";
  }>;
  toolName: z.ZodString;
  error: z.ZodOptional<z.ZodString>;
}> = z.looseObject({
  status: z.enum([
    "tool-running",
    "tool-completed",
    "tool-awaiting-approval",
    "tool-failed",
  ]),
  toolName: z.string().trim().min(1).max(256),
  error: z.string().max(4_096).optional(),
});

export type ChatToolStatusEvent = z.output<typeof chatToolStatusEventSchema>;
export type ChatToolStatusValue = ChatToolStatusEvent["status"];

/**
 * Version-1 wire events emitted by the Chat stream. These are transport and
 * server-owned lifecycle facts, not assembled UI messages or host view state.
 */
export const chatProtocolEventSchema: z.ZodDiscriminatedUnion<
  [
    Loose<{
      type: z.ZodLiteral<"start">;
      messageId: z.ZodOptional<z.ZodString>;
    }>,
    Loose<{ type: z.ZodLiteral<"start-step"> }>,
    Loose<{ type: z.ZodLiteral<"finish-step"> }>,
    Loose<{
      type: z.ZodLiteral<"finish">;
      finishReason: z.ZodOptional<
        z.ZodEnum<{
          length: "length";
          error: "error";
          stop: "stop";
          "content-filter": "content-filter";
          "tool-calls": "tool-calls";
          other: "other";
        }>
      >;
    }>,
    Loose<{
      type: z.ZodLiteral<"abort">;
      reason: z.ZodOptional<z.ZodString>;
    }>,
    Loose<{ type: z.ZodLiteral<"error">; errorText: z.ZodString }>,
    Loose<{ type: z.ZodLiteral<"text-start">; id: z.ZodString }>,
    Loose<{
      type: z.ZodLiteral<"text-delta">;
      id: z.ZodString;
      delta: z.ZodString;
    }>,
    Loose<{ type: z.ZodLiteral<"text-end">; id: z.ZodString }>,
    Loose<{ type: z.ZodLiteral<"reasoning-start">; id: z.ZodString }>,
    Loose<{
      type: z.ZodLiteral<"reasoning-delta">;
      id: z.ZodString;
      delta: z.ZodString;
    }>,
    Loose<{ type: z.ZodLiteral<"reasoning-end">; id: z.ZodString }>,
    Loose<{
      type: z.ZodLiteral<"tool-input-start">;
      toolCallId: z.ZodString;
      toolName: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }>,
    Loose<{
      type: z.ZodLiteral<"tool-input-delta">;
      toolCallId: z.ZodString;
      inputTextDelta: z.ZodString;
    }>,
    Loose<{
      type: z.ZodLiteral<"tool-input-available">;
      toolCallId: z.ZodString;
      toolName: z.ZodString;
      input: z.ZodUnknown;
      title: z.ZodOptional<z.ZodString>;
    }>,
    Loose<{
      type: z.ZodLiteral<"tool-input-error">;
      toolCallId: z.ZodString;
      toolName: z.ZodString;
      input: z.ZodUnknown;
      errorText: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }>,
    Loose<{
      type: z.ZodLiteral<"tool-approval-request">;
      approvalId: z.ZodString;
      toolCallId: z.ZodString;
    }>,
    Loose<{
      type: z.ZodLiteral<"tool-output-available">;
      toolCallId: z.ZodString;
      output: z.ZodUnknown;
      preliminary: z.ZodOptional<z.ZodBoolean>;
    }>,
    Loose<{
      type: z.ZodLiteral<"tool-output-error">;
      toolCallId: z.ZodString;
      errorText: z.ZodString;
    }>,
    Loose<{
      type: z.ZodLiteral<"tool-output-denied">;
      toolCallId: z.ZodString;
    }>,
    Loose<{
      type: z.ZodLiteral<"source-url">;
      sourceId: z.ZodString;
      url: z.ZodString;
      title: z.ZodOptional<z.ZodString>;
    }>,
    Loose<{
      type: z.ZodLiteral<"source-document">;
      sourceId: z.ZodString;
      mediaType: z.ZodString;
      title: z.ZodString;
      filename: z.ZodOptional<z.ZodString>;
    }>,
    Loose<{
      type: z.ZodLiteral<"file">;
      url: z.ZodString;
      mediaType: z.ZodString;
    }>,
    Loose<{
      type: z.ZodLiteral<"data-progress">;
      id: z.ZodOptional<z.ZodString>;
      data: typeof chatProgressEventSchema;
      transient: z.ZodOptional<z.ZodBoolean>;
    }>,
    Loose<{
      type: z.ZodLiteral<"data-status">;
      id: z.ZodOptional<z.ZodString>;
      data: typeof chatToolStatusEventSchema;
      transient: z.ZodOptional<z.ZodBoolean>;
    }>,
    Loose<{
      type: z.ZodLiteral<"data-tool-result">;
      id: z.ZodOptional<z.ZodString>;
      data: typeof chatToolResultSchema;
      transient: z.ZodOptional<z.ZodBoolean>;
    }>,
    Loose<{
      type: z.ZodLiteral<"data-actions">;
      id: z.ZodOptional<z.ZodString>;
      data: typeof chatActionsCardSchema;
      transient: z.ZodOptional<z.ZodBoolean>;
    }>,
    Loose<{
      type: z.ZodLiteral<"data-sources">;
      id: z.ZodOptional<z.ZodString>;
      data: typeof chatSourcesCardSchema;
      transient: z.ZodOptional<z.ZodBoolean>;
    }>,
    Loose<{
      type: z.ZodLiteral<"data-attachment">;
      id: z.ZodOptional<z.ZodString>;
      data: typeof chatAttachmentCardSchema;
      transient: z.ZodOptional<z.ZodBoolean>;
    }>,
  ],
  "type"
> = z.discriminatedUnion("type", [
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
    type: z.literal("data-tool-result"),
    id: chatIdSchema.optional(),
    data: chatToolResultSchema,
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

export type ChatProtocolEvent = z.output<typeof chatProtocolEventSchema>;

export const chatContextHandoffResponseSchema: Strict<{
  conversationId: z.ZodString;
}> = z.strictObject({
  conversationId: chatIdSchema,
});

export type ChatContextHandoffResponse = z.output<
  typeof chatContextHandoffResponseSchema
>;

export const renameChatSessionRequestSchema: Strict<{
  title: z.ZodString;
}> = z
  .object({
    title: chatTitleSchema,
  })
  .strict();

export type RenameChatSessionRequest = z.output<
  typeof renameChatSessionRequestSchema
>;

export const renameChatSessionResponseSchema: z.ZodObject<{
  renamed: z.ZodBoolean;
  title: z.ZodString;
}> = z.object({
  renamed: z.boolean(),
  title: chatTitleSchema,
});

export type RenameChatSessionResponse = z.output<
  typeof renameChatSessionResponseSchema
>;

export const archiveChatSessionResponseSchema: z.ZodObject<{
  archived: z.ZodBoolean;
}> = z.object({
  archived: z.boolean(),
});

export type ArchiveChatSessionResponse = z.output<
  typeof archiveChatSessionResponseSchema
>;

export const deleteChatSessionResponseSchema: z.ZodObject<{
  deleted: z.ZodBoolean;
}> = z.object({
  deleted: z.boolean(),
});

export type DeleteChatSessionResponse = z.output<
  typeof deleteChatSessionResponseSchema
>;

export const chatActionRequestSchema: Strict<{
  conversationId: z.ZodString;
  action: typeof agentEventActionSchema;
}> = z
  .object({
    conversationId: chatIdSchema,
    action: agentEventActionSchema,
  })
  .strict();

export type ChatActionRequest = z.output<typeof chatActionRequestSchema>;

export const chatJobStatusSchema: Loose<{
  id: z.ZodString;
  status: typeof chatJobStatusValueSchema;
  message: z.ZodOptional<z.ZodString>;
}> = z.looseObject({
  id: chatIdSchema,
  status: chatJobStatusValueSchema,
  message: z.string().max(4_096).optional(),
});

export type ChatJobStatus = z.output<typeof chatJobStatusSchema>;

export const chatUploadResponseSchema: Loose<{
  id: z.ZodString;
  ref: typeof chatUploadRefSchema;
  filename: z.ZodString;
  mediaType: z.ZodString;
  sizeBytes: z.ZodNumber;
  createdAt: z.ZodString;
  url: z.ZodString;
  downloadUrl: z.ZodString;
}> = z
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

export type ChatUploadResponse = z.output<typeof chatUploadResponseSchema>;

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
