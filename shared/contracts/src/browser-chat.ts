import { z } from "@brains/utils/zod";
import { agentEventActionSchema, type AgentEventAction } from "./agent-action";

export const BROWSER_CHAT_API_VERSION = 1 as const;
export const DEFAULT_BROWSER_CHAT_API_PATH = "/api/chat" as const;

const browserChatIdSchema = z.string().trim().min(1).max(256);
const browserChatUploadIdSchema = z
  .string()
  .regex(
    /^upload-[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
const browserChatTitleSchema = z.string().trim().min(1).max(48);
const browserChatTimestampSchema = z.string().datetime();
const browserChatRelativeUrlSchema = z
  .string()
  .regex(/^\/(?!\/)/)
  .max(2_048);
const browserChatLinkUrlSchema = z
  .string()
  .regex(/^(?:\/(?!\/)|https?:\/\/)/)
  .max(2_048);

type BrowserChatToolApprovalCardState =
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-denied"
  | "output-error";

interface BrowserChatToolApprovalCard {
  [key: string]: unknown;
  kind: "tool-approval";
  id: string;
  toolCallId?: string | undefined;
  toolName: string;
  input?: Record<string, unknown> | undefined;
  summary: string;
  completionSummary?: string | undefined;
  preview?: string | undefined;
  state: BrowserChatToolApprovalCardState;
  output?: unknown;
  error?: string | undefined;
}

const browserChatToolApprovalCardSchema = z.looseObject({
  kind: z.literal("tool-approval"),
  id: browserChatIdSchema,
  toolCallId: browserChatIdSchema.optional(),
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

interface BrowserChatAttachmentCardSource {
  [key: string]: unknown;
  entityType?: string | undefined;
  entityId?: string | undefined;
  attachmentType?: string | undefined;
}

const browserChatAttachmentCardSourceSchema: z.ZodType<BrowserChatAttachmentCardSource> =
  z.looseObject({
    entityType: z.string().trim().min(1).max(128).optional(),
    entityId: browserChatIdSchema.optional(),
    attachmentType: z.string().trim().min(1).max(128).optional(),
  });

interface BrowserChatAttachmentCardData {
  [key: string]: unknown;
  mediaType: string;
  url: string;
  downloadUrl?: string | undefined;
  previewUrl?: string | undefined;
  filename?: string | undefined;
  sizeBytes?: number | undefined;
  source?: BrowserChatAttachmentCardSource | undefined;
}

const browserChatAttachmentCardDataSchema: z.ZodType<BrowserChatAttachmentCardData> =
  z.looseObject({
    mediaType: z.string().trim().min(1).max(255),
    url: browserChatLinkUrlSchema,
    downloadUrl: browserChatLinkUrlSchema.optional(),
    previewUrl: browserChatLinkUrlSchema.optional(),
    filename: z.string().trim().min(1).max(255).optional(),
    sizeBytes: z.number().int().nonnegative().optional(),
    source: browserChatAttachmentCardSourceSchema.optional(),
  });

interface BrowserChatAttachmentCard {
  [key: string]: unknown;
  kind: "attachment";
  id: string;
  jobId?: string | undefined;
  title: string;
  description?: string | undefined;
  attachment: BrowserChatAttachmentCardData;
}

const browserChatAttachmentCardSchema = z.looseObject({
  kind: z.literal("attachment"),
  id: browserChatIdSchema,
  jobId: browserChatIdSchema.optional(),
  title: z.string().max(4_096),
  description: z.string().max(20_000).optional(),
  attachment: browserChatAttachmentCardDataSchema,
});

interface BrowserChatSourceCitation {
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

const browserChatSourceCitationSchema: z.ZodType<BrowserChatSourceCitation> =
  z.looseObject({
    id: browserChatIdSchema,
    title: z.string().max(4_096).optional(),
    source: z.string().trim().min(1).max(512),
    url: browserChatLinkUrlSchema.optional(),
    entityType: z.string().trim().min(1).max(128).optional(),
    entityId: browserChatIdSchema.optional(),
    excerpt: z.string().max(20_000).optional(),
    provenance: z.record(z.string(), z.unknown()).optional(),
  });

interface BrowserChatSourcesCard {
  [key: string]: unknown;
  kind: "sources";
  id: string;
  title?: string | undefined;
  sources: BrowserChatSourceCitation[];
}

const browserChatSourcesCardSchema = z.looseObject({
  kind: z.literal("sources"),
  id: browserChatIdSchema,
  title: z.string().max(4_096).optional(),
  sources: z.array(browserChatSourceCitationSchema).min(1).max(100),
});

interface BrowserChatPromptAction {
  type: "prompt";
  id: string;
  label: string;
  prompt: string;
  description?: string | undefined;
}

interface BrowserChatSuggestedEventAction {
  type: "event";
  id: string;
  label: string;
  event: string;
  fromState?: string | undefined;
  description?: string | undefined;
}

type BrowserChatSuggestedAction =
  BrowserChatPromptAction | BrowserChatSuggestedEventAction;

const browserChatSuggestedActionSchema: z.ZodType<BrowserChatSuggestedAction> =
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("prompt"),
      id: browserChatIdSchema,
      label: z.string().trim().min(1).max(256),
      prompt: z.string().min(1).max(100_000),
      description: z.string().max(4_096).optional(),
    }),
    z.object({
      type: z.literal("event"),
      id: browserChatIdSchema,
      label: z.string().trim().min(1).max(256),
      event: z.string().trim().min(1).max(256),
      fromState: z.string().trim().min(1).max(256).optional(),
      description: z.string().max(4_096).optional(),
    }),
  ]);

interface BrowserChatActionsCard {
  [key: string]: unknown;
  kind: "actions";
  id: string;
  title?: string | undefined;
  actions: BrowserChatSuggestedAction[];
}

const browserChatActionsCardSchema = z.looseObject({
  kind: z.literal("actions"),
  id: browserChatIdSchema,
  title: z.string().max(4_096).optional(),
  actions: z.array(browserChatSuggestedActionSchema).min(1).max(100),
});

export type BrowserChatCard =
  | BrowserChatToolApprovalCard
  | BrowserChatAttachmentCard
  | BrowserChatSourcesCard
  | BrowserChatActionsCard;

export const browserChatCardSchema: z.ZodType<BrowserChatCard> =
  z.discriminatedUnion("kind", [
    browserChatToolApprovalCardSchema,
    browserChatAttachmentCardSchema,
    browserChatSourcesCardSchema,
    browserChatActionsCardSchema,
  ]);

export type BrowserChatEventAction = AgentEventAction;
export const browserChatEventActionSchema: typeof agentEventActionSchema =
  agentEventActionSchema;

interface BrowserChatPendingConfirmation {
  id: string;
  toolCallId?: string | undefined;
  toolName: string;
  summary: string;
  completionSummary?: string | undefined;
  preview?: string | undefined;
  args: unknown;
}

const browserChatPendingConfirmationSchema: z.ZodType<BrowserChatPendingConfirmation> =
  z.object({
    id: browserChatIdSchema,
    toolCallId: browserChatIdSchema.optional(),
    toolName: z.string().trim().min(1).max(256),
    summary: z.string().max(4_096),
    completionSummary: z.string().max(4_096).optional(),
    preview: z.string().max(100_000).optional(),
    args: z.unknown(),
  });

interface BrowserChatToolResultError {
  message: string;
  code?: string | undefined;
}

interface BrowserChatToolResult {
  toolName: string;
  args?: Record<string, unknown> | undefined;
  jobId?: string | undefined;
  data?: unknown;
  error?: BrowserChatToolResultError | undefined;
}

const browserChatToolResultSchema: z.ZodType<BrowserChatToolResult> = z.object({
  toolName: z.string().trim().min(1).max(256),
  args: z.record(z.string(), z.unknown()).optional(),
  jobId: browserChatIdSchema.optional(),
  data: z.unknown().optional(),
  error: z
    .object({
      message: z.string().max(4_096),
      code: z.string().trim().min(1).max(256).optional(),
    })
    .optional(),
});

interface BrowserChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface BrowserChatActionResponse {
  [key: string]: unknown;
  text: string;
  toolResults?: BrowserChatToolResult[] | undefined;
  cards?: BrowserChatCard[] | undefined;
  pendingConfirmations?: BrowserChatPendingConfirmation[] | undefined;
  usage: BrowserChatUsage;
}

export const browserChatActionResponseSchema: z.ZodType<BrowserChatActionResponse> =
  z.looseObject({
    text: z.string().max(1_000_000),
    toolResults: z.array(browserChatToolResultSchema).max(100).optional(),
    cards: z.array(browserChatCardSchema).max(100).optional(),
    pendingConfirmations: z
      .array(browserChatPendingConfirmationSchema)
      .max(100)
      .optional(),
    usage: z.object({
      promptTokens: z.number().int().nonnegative(),
      completionTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
    }),
  });

export interface BrowserChatApiPaths {
  stream: string;
  actions: string;
  sessions: string;
  sessionArchive: string;
  messages: string;
  uploads: string;
  documentAttachments: string;
  imageAttachments: string;
  jobStatus: string;
}

export function createBrowserChatApiPaths(
  apiPath: string = DEFAULT_BROWSER_CHAT_API_PATH,
): BrowserChatApiPaths {
  const normalized = normalizeBrowserChatApiPath(apiPath);
  return {
    stream: normalized,
    actions: `${normalized}/actions`,
    sessions: `${normalized}/sessions`,
    sessionArchive: `${normalized}/sessions/archive`,
    messages: `${normalized}/messages`,
    uploads: `${normalized}/uploads`,
    documentAttachments: `${normalized}/attachments/document`,
    imageAttachments: `${normalized}/attachments/image`,
    jobStatus: `${normalized}/jobs/status`,
  };
}

function normalizeBrowserChatApiPath(apiPath: string): string {
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
      "Browser Chat API path must be a same-origin absolute path without query or fragment",
    );
  }
  const normalized = trimmed.replace(/\/+$/, "");
  if (normalized.length === 0) {
    throw new Error("Browser Chat API path must not be the site root");
  }
  return normalized;
}

export interface BrowserChatSession {
  [key: string]: unknown;
  id: string;
  title: string;
  lastActiveAt: string;
}

export const browserChatSessionSchema: z.ZodType<BrowserChatSession> =
  z.looseObject({
    id: browserChatIdSchema,
    title: browserChatTitleSchema,
    lastActiveAt: browserChatTimestampSchema,
  });

export interface BrowserChatSessionsResponse {
  [key: string]: unknown;
  sessions: BrowserChatSession[];
}

export const browserChatSessionsResponseSchema: z.ZodType<BrowserChatSessionsResponse> =
  z.looseObject({
    sessions: z.array(browserChatSessionSchema).max(100),
  });

export interface BrowserChatHistoryAttachmentSource {
  [key: string]: unknown;
  kind: string;
  id: string;
}

export const browserChatHistoryAttachmentSourceSchema: z.ZodType<BrowserChatHistoryAttachmentSource> =
  z.looseObject({
    kind: z.string().trim().min(1).max(64),
    id: browserChatIdSchema,
  });

export interface BrowserChatHistoryAttachment {
  [key: string]: unknown;
  kind: "text";
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  source?: BrowserChatHistoryAttachmentSource | undefined;
}

export const browserChatHistoryAttachmentSchema: z.ZodType<BrowserChatHistoryAttachment> =
  z.looseObject({
    kind: z.literal("text"),
    filename: z.string().trim().min(1).max(255),
    mediaType: z.string().trim().min(1).max(255),
    sizeBytes: z.number().int().nonnegative(),
    createdAt: browserChatTimestampSchema,
    source: browserChatHistoryAttachmentSourceSchema.optional(),
  });

export interface BrowserChatHistoryMessage {
  [key: string]: unknown;
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: BrowserChatHistoryAttachment[] | undefined;
  cards?: BrowserChatCard[] | undefined;
}

export const browserChatHistoryMessageSchema: z.ZodType<BrowserChatHistoryMessage> =
  z.looseObject({
    id: browserChatIdSchema,
    role: z.enum(["user", "assistant"]),
    content: z.string().max(1_000_000),
    attachments: z
      .array(browserChatHistoryAttachmentSchema)
      .max(100)
      .optional(),
    cards: z.array(browserChatCardSchema).max(100).optional(),
  });

export interface BrowserChatMessagesResponse {
  [key: string]: unknown;
  messages: BrowserChatHistoryMessage[];
}

export const browserChatMessagesResponseSchema: z.ZodType<BrowserChatMessagesResponse> =
  z.looseObject({
    messages: z.array(browserChatHistoryMessageSchema).max(100),
  });

export interface BrowserChatTextPart {
  type: "text";
  text: string;
}

export const browserChatTextPartSchema: z.ZodType<
  BrowserChatTextPart,
  BrowserChatTextPart
> = z.object({
  type: z.literal("text"),
  text: z.string().max(1_000_000),
});

export interface BrowserChatFilePart {
  type: "file";
  mediaType?: string | undefined;
  filename?: string | undefined;
  url: string;
}

export const browserChatFilePartSchema: z.ZodType<
  BrowserChatFilePart,
  BrowserChatFilePart
> = z.object({
  type: z.literal("file"),
  mediaType: z.string().trim().min(1).max(255).optional(),
  filename: z.string().trim().min(1).max(255).optional(),
  url: z.string().min(1).max(2_000_000),
});

export interface BrowserChatUploadPartData {
  [key: string]: unknown;
  ref: BrowserChatUploadRef;
}

export interface BrowserChatUploadPart {
  type: "data-upload";
  data: BrowserChatUploadPartData;
}

export const browserChatUploadPartSchema: z.ZodType<BrowserChatUploadPart> =
  z.object({
    type: z.literal("data-upload"),
    data: z.looseObject({
      ref: z.object({
        kind: z.literal("upload"),
        id: browserChatUploadIdSchema,
      }),
    }),
  });

export interface BrowserChatApprovalResponse {
  id: string;
  approved: boolean;
  toolCallId?: string | undefined;
  toolName?: string | undefined;
  input?: Record<string, unknown> | undefined;
  title?: string | undefined;
}

export const browserChatApprovalResponseSchema: z.ZodType<
  BrowserChatApprovalResponse,
  BrowserChatApprovalResponse
> = z.object({
  id: browserChatIdSchema,
  approved: z.boolean(),
  toolCallId: browserChatIdSchema.optional(),
  toolName: z.string().trim().min(1).max(256).optional(),
  input: z.record(z.string(), z.unknown()).optional(),
  title: z.string().max(4_096).optional(),
});

export interface BrowserChatApprovalResponsePart {
  [key: string]: unknown;
  state: "approval-responded";
  toolCallId?: string | undefined;
  toolName?: string | undefined;
  input?: Record<string, unknown> | undefined;
  title?: string | undefined;
  approval: BrowserChatApprovalResponse;
}

export const browserChatApprovalResponsePartSchema: z.ZodType<BrowserChatApprovalResponsePart> =
  z.looseObject({
    state: z.literal("approval-responded"),
    toolCallId: browserChatIdSchema.optional(),
    toolName: z.string().trim().min(1).max(256).optional(),
    input: z.record(z.string(), z.unknown()).optional(),
    title: z.string().max(4_096).optional(),
    approval: browserChatApprovalResponseSchema,
  });

export type BrowserChatMessageRole = "user" | "assistant" | "system";

export interface BrowserChatMessage {
  id?: string | undefined;
  role: BrowserChatMessageRole;
  parts?: unknown[] | undefined;
  content?: string | undefined;
}

export const browserChatMessageSchema: z.ZodType<
  BrowserChatMessage,
  BrowserChatMessage
> = z.object({
  id: browserChatIdSchema.optional(),
  role: z.enum(["user", "assistant", "system"]),
  parts: z.array(z.unknown()).max(1_000).optional(),
  content: z.string().max(1_000_000).optional(),
});

export interface BrowserChatSourceContext {
  sourceId: string;
  itemId: string;
  label: string;
}

const browserChatSafeText = (max: number): z.ZodString =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value));

export const browserChatSourceContextSchema: z.ZodType<
  BrowserChatSourceContext,
  BrowserChatSourceContext
> = z.strictObject({
  sourceId: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(64),
  itemId: z.string().trim().min(1).max(300),
  label: browserChatSafeText(160),
});

export interface BrowserChatMessageRequest {
  id?: string | undefined;
  messages: BrowserChatMessage[];
  trigger?: string | undefined;
  inboxContext?: BrowserChatSourceContext | undefined;
}

export const browserChatMessageRequestSchema: z.ZodType<
  BrowserChatMessageRequest,
  BrowserChatMessageRequest
> = z
  .object({
    id: browserChatIdSchema.optional(),
    messages: z.array(browserChatMessageSchema).min(1).max(200),
    trigger: z.string().trim().min(1).max(64).optional(),
    inboxContext: browserChatSourceContextSchema.optional(),
  })
  .strict();

export interface BrowserChatProgressEvent {
  [key: string]: unknown;
  type: "job" | "batch";
  status: BrowserChatJobStatusValue;
  operationType:
    | "file_operations"
    | "content_operations"
    | "data_processing"
    | "batch_processing";
  operationTarget?: string | undefined;
  message?: string | undefined;
  progress?: { current: number; total: number; percentage: number } | undefined;
}

export const browserChatProgressEventSchema: z.ZodType<BrowserChatProgressEvent> =
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

export type BrowserChatToolStatusValue =
  "tool-running" | "tool-completed" | "tool-awaiting-approval" | "tool-failed";

export interface BrowserChatToolStatusEvent {
  [key: string]: unknown;
  status: BrowserChatToolStatusValue;
  toolName: string;
  error?: string | undefined;
}

export const browserChatToolStatusEventSchema: z.ZodType<BrowserChatToolStatusEvent> =
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

export interface BrowserChatContextHandoffRequest {
  version: 1;
  sourceId: string;
  itemId: string;
  titleSeed: string;
}

export const browserChatContextHandoffRequestSchema: z.ZodType<
  BrowserChatContextHandoffRequest,
  BrowserChatContextHandoffRequest
> = z.strictObject({
  version: z.literal(1),
  sourceId: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9-]*$/)
    .max(64),
  itemId: z.string().trim().min(1).max(300),
  titleSeed: browserChatSafeText(160),
});

export interface BrowserChatContextHandoffResponse {
  conversationId: string;
}

export const browserChatContextHandoffResponseSchema: z.ZodType<
  BrowserChatContextHandoffResponse,
  BrowserChatContextHandoffResponse
> = z.strictObject({
  conversationId: browserChatIdSchema,
});

export interface RenameBrowserChatSessionRequest {
  title: string;
}

export const renameBrowserChatSessionRequestSchema: z.ZodType<
  RenameBrowserChatSessionRequest,
  RenameBrowserChatSessionRequest
> = z
  .object({
    title: browserChatTitleSchema,
  })
  .strict();

export interface RenameBrowserChatSessionResponse {
  renamed: boolean;
  title: string;
}

export const renameBrowserChatSessionResponseSchema: z.ZodType<RenameBrowserChatSessionResponse> =
  z.object({
    renamed: z.boolean(),
    title: browserChatTitleSchema,
  });

export interface ArchiveBrowserChatSessionResponse {
  archived: boolean;
}

export const archiveBrowserChatSessionResponseSchema: z.ZodType<ArchiveBrowserChatSessionResponse> =
  z.object({
    archived: z.boolean(),
  });

export interface DeleteBrowserChatSessionResponse {
  deleted: boolean;
}

export const deleteBrowserChatSessionResponseSchema: z.ZodType<DeleteBrowserChatSessionResponse> =
  z.object({
    deleted: z.boolean(),
  });

export interface BrowserChatActionRequest {
  conversationId: string;
  action: BrowserChatEventAction;
}

export const browserChatActionRequestSchema: z.ZodType<
  BrowserChatActionRequest,
  BrowserChatActionRequest
> = z
  .object({
    conversationId: browserChatIdSchema,
    action: agentEventActionSchema,
  })
  .strict();

export type BrowserChatJobStatusValue =
  "pending" | "processing" | "completed" | "failed";

export interface BrowserChatJobStatus {
  [key: string]: unknown;
  id: string;
  status: BrowserChatJobStatusValue;
  message?: string | undefined;
}

export const browserChatJobStatusSchema: z.ZodType<BrowserChatJobStatus> =
  z.looseObject({
    id: browserChatIdSchema,
    status: z.enum(["pending", "processing", "completed", "failed"]),
    message: z.string().max(4_096).optional(),
  });

export interface BrowserChatUploadRef {
  kind: "upload";
  id: string;
}

export const browserChatUploadRefSchema: z.ZodType<
  BrowserChatUploadRef,
  BrowserChatUploadRef
> = z.object({
  kind: z.literal("upload"),
  id: browserChatUploadIdSchema,
});

export interface BrowserChatUploadResponse {
  [key: string]: unknown;
  id: string;
  ref: BrowserChatUploadRef;
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  url: string;
  downloadUrl: string;
}

export const browserChatUploadResponseSchema: z.ZodType<BrowserChatUploadResponse> =
  z
    .looseObject({
      id: browserChatUploadIdSchema,
      ref: browserChatUploadRefSchema,
      filename: z.string().trim().min(1).max(255),
      mediaType: z.string().trim().min(1).max(255),
      sizeBytes: z.number().int().nonnegative(),
      createdAt: browserChatTimestampSchema,
      url: browserChatRelativeUrlSchema,
      downloadUrl: browserChatRelativeUrlSchema,
    })
    .refine((upload) => upload.id === upload.ref.id, {
      path: ["ref", "id"],
      message: "Upload response ids must match",
    });

export type BrowserChatFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface BrowserChatClientOptions {
  apiPath?: string | undefined;
  fetch?: BrowserChatFetch | undefined;
  credentials?: RequestCredentials | undefined;
}

export interface BrowserChatClient {
  readonly version: typeof BROWSER_CHAT_API_VERSION;
  readonly paths: BrowserChatApiPaths;
  streamMessages(
    request: BrowserChatMessageRequest,
    options?: { signal?: AbortSignal | undefined },
  ): Promise<Response>;
  listSessions(): Promise<BrowserChatSession[]>;
  getMessages(conversationId: string): Promise<BrowserChatHistoryMessage[]>;
  renameSession(
    conversationId: string,
    title: string,
  ): Promise<RenameBrowserChatSessionResponse>;
  archiveSession(
    conversationId: string,
  ): Promise<ArchiveBrowserChatSessionResponse>;
  deleteSession(
    conversationId: string,
  ): Promise<DeleteBrowserChatSessionResponse>;
  getJobStatus(jobId: string): Promise<BrowserChatJobStatus>;
  runAction(
    request: BrowserChatActionRequest,
  ): Promise<BrowserChatActionResponse>;
  upload(file: Blob, filename: string): Promise<BrowserChatUploadResponse>;
  getUploadUrl(uploadId: string, download?: boolean): string;
  getDocumentAttachmentUrl(documentId: string, download?: boolean): string;
  getImageAttachmentUrl(imageId: string, download?: boolean): string;
}

export type BrowserChatApiErrorKind = "http" | "invalid-response";

export class BrowserChatApiError extends Error {
  public readonly operation: string;
  public readonly status: number;
  public readonly kind: BrowserChatApiErrorKind;

  public constructor(
    operation: string,
    status: number,
    kind: BrowserChatApiErrorKind = "http",
  ) {
    super(`Browser Chat could not ${operation} (${status})`);
    this.name = "BrowserChatApiError";
    this.operation = operation;
    this.status = status;
    this.kind = kind;
  }
}

export function createBrowserChatClient(
  options: BrowserChatClientOptions = {},
): BrowserChatClient {
  const paths = createBrowserChatApiPaths(options.apiPath);
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
      throw new BrowserChatApiError(operation, response.status);
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new BrowserChatApiError(operation, 502, "invalid-response");
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new BrowserChatApiError(operation, 502, "invalid-response");
    }
    return parsed.data;
  }

  function withId(path: string, id: string): string {
    const parsedId = browserChatIdSchema.parse(id);
    return `${path}?id=${encodeURIComponent(parsedId)}`;
  }

  function withDownload(path: string, id: string, download: boolean): string {
    const base = withId(path, id);
    return download ? `${base}&download=1` : base;
  }

  return {
    version: BROWSER_CHAT_API_VERSION,
    paths,
    async streamMessages(
      request: BrowserChatMessageRequest,
      streamOptions: { signal?: AbortSignal | undefined } = {},
    ): Promise<Response> {
      const body = browserChatMessageRequestSchema.parse(request);
      const response = await fetchFn(paths.stream, {
        method: "POST",
        credentials,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        ...(streamOptions.signal ? { signal: streamOptions.signal } : {}),
      });
      if (!response.ok) {
        throw new BrowserChatApiError("send messages", response.status);
      }
      return response;
    },
    async listSessions(): Promise<BrowserChatSession[]> {
      const response = await requestJson(
        "list sessions",
        paths.sessions,
        browserChatSessionsResponseSchema,
      );
      return response.sessions;
    },
    async getMessages(
      conversationId: string,
    ): Promise<BrowserChatHistoryMessage[]> {
      const response = await requestJson(
        "load messages",
        withId(paths.messages, conversationId),
        browserChatMessagesResponseSchema,
      );
      return response.messages;
    },
    async renameSession(
      conversationId: string,
      title: string,
    ): Promise<RenameBrowserChatSessionResponse> {
      const body = renameBrowserChatSessionRequestSchema.parse({ title });
      return requestJson(
        "rename session",
        withId(paths.sessions, conversationId),
        renameBrowserChatSessionResponseSchema,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    },
    async archiveSession(
      conversationId: string,
    ): Promise<ArchiveBrowserChatSessionResponse> {
      return requestJson(
        "archive session",
        withId(paths.sessionArchive, conversationId),
        archiveBrowserChatSessionResponseSchema,
        { method: "PUT" },
      );
    },
    async deleteSession(
      conversationId: string,
    ): Promise<DeleteBrowserChatSessionResponse> {
      return requestJson(
        "delete session",
        withId(paths.sessions, conversationId),
        deleteBrowserChatSessionResponseSchema,
        { method: "DELETE" },
      );
    },
    getJobStatus(jobId: string): Promise<BrowserChatJobStatus> {
      return requestJson(
        "load job status",
        withId(paths.jobStatus, jobId),
        browserChatJobStatusSchema,
      );
    },
    runAction(
      request: BrowserChatActionRequest,
    ): Promise<BrowserChatActionResponse> {
      const body = browserChatActionRequestSchema.parse(request);
      return requestJson(
        "run action",
        paths.actions,
        browserChatActionResponseSchema,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
    },
    async upload(
      file: Blob,
      filename: string,
    ): Promise<BrowserChatUploadResponse> {
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
        browserChatUploadResponseSchema,
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
