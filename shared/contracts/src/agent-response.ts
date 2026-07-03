import { stripUndefinedDeep } from "@brains/utils";
import { z } from "@brains/utils/zod-v4";

export interface PendingConfirmation {
  id: string;
  toolCallId?: string | undefined;
  toolName: string;
  summary: string;
  completionSummary?: string | undefined;
  preview?: string | undefined;
  args: unknown;
}

export const PendingConfirmationSchema: z.ZodType<
  PendingConfirmation,
  PendingConfirmation
> = z.object({
  id: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string(),
  summary: z.string(),
  completionSummary: z.string().optional(),
  preview: z.string().optional(),
  args: z.unknown(),
});

export type ToolApprovalCardState =
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-denied"
  | "output-error";

export const ToolApprovalCardStateSchema: z.ZodType<
  ToolApprovalCardState,
  ToolApprovalCardState
> = z.enum([
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-denied",
  "output-error",
]);

export interface ToolApprovalCard {
  kind: "tool-approval";
  id: string;
  toolCallId?: string | undefined;
  toolName: string;
  input?: Record<string, unknown> | undefined;
  summary: string;
  completionSummary?: string | undefined;
  preview?: string | undefined;
  state: ToolApprovalCardState;
  output?: unknown;
  error?: string | undefined;
}

const ToolApprovalCardSchemaImpl = z.object({
  kind: z.literal("tool-approval"),
  id: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()).optional(),
  summary: z.string(),
  completionSummary: z.string().optional(),
  preview: z.string().optional(),
  state: ToolApprovalCardStateSchema,
  output: z.unknown().optional(),
  error: z.string().optional(),
});

export const ToolApprovalCardSchema: z.ZodType<
  ToolApprovalCard,
  ToolApprovalCard
> = ToolApprovalCardSchemaImpl;

export interface AttachmentCardSource {
  entityType?: string | undefined;
  entityId?: string | undefined;
  attachmentType?: string | undefined;
}

export const AttachmentCardSourceSchema: z.ZodType<
  AttachmentCardSource,
  AttachmentCardSource
> = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  attachmentType: z.string().optional(),
});

export interface AttachmentCardData {
  mediaType: string;
  url: string;
  downloadUrl?: string | undefined;
  previewUrl?: string | undefined;
  filename?: string | undefined;
  sizeBytes?: number | undefined;
  source?: AttachmentCardSource | undefined;
}

export const AttachmentCardDataSchema: z.ZodType<
  AttachmentCardData,
  AttachmentCardData
> = z.object({
  mediaType: z.string().min(1),
  url: z.string().min(1),
  downloadUrl: z.string().min(1).optional(),
  previewUrl: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  sizeBytes: z.number().nonnegative().optional(),
  source: AttachmentCardSourceSchema.optional(),
});

export interface AttachmentCard {
  kind: "attachment";
  id: string;
  jobId?: string | undefined;
  title: string;
  description?: string | undefined;
  attachment: AttachmentCardData;
}

const AttachmentCardSchemaImpl = z.object({
  kind: z.literal("attachment"),
  id: z.string(),
  jobId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  attachment: AttachmentCardDataSchema,
});

export const AttachmentCardSchema: z.ZodType<AttachmentCard, AttachmentCard> =
  AttachmentCardSchemaImpl;

export interface SourceCitation {
  id: string;
  title?: string | undefined;
  source: string;
  url?: string | undefined;
  entityType?: string | undefined;
  entityId?: string | undefined;
  excerpt?: string | undefined;
  provenance?: Record<string, unknown> | undefined;
}

export const SourceCitationSchema: z.ZodType<SourceCitation, SourceCitation> =
  z.object({
    id: z.string().min(1),
    title: z.string().min(1).optional(),
    source: z.string().min(1),
    url: z.string().min(1).optional(),
    entityType: z.string().min(1).optional(),
    entityId: z.string().min(1).optional(),
    excerpt: z.string().min(1).optional(),
    provenance: z.record(z.string(), z.unknown()).optional(),
  });

export interface SourcesCard {
  kind: "sources";
  id: string;
  title?: string | undefined;
  sources: SourceCitation[];
}

const SourcesCardSchemaImpl = z.object({
  kind: z.literal("sources"),
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  sources: z.array(SourceCitationSchema).min(1),
});

export const SourcesCardSchema: z.ZodType<SourcesCard, SourcesCard> =
  SourcesCardSchemaImpl;

export interface PromptChatAction {
  type: "prompt";
  id: string;
  label: string;
  prompt: string;
  description?: string | undefined;
}

const PromptChatActionSchemaImpl = z.object({
  type: z.literal("prompt"),
  id: z.string().min(1),
  label: z.string().min(1),
  prompt: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const PromptChatActionSchema: z.ZodType<
  PromptChatAction,
  PromptChatAction
> = PromptChatActionSchemaImpl;

export interface EventChatAction {
  type: "event";
  id: string;
  label: string;
  event: string;
  description?: string | undefined;
}

const EventChatActionSchemaImpl = z.object({
  type: z.literal("event"),
  id: z.string().min(1),
  label: z.string().min(1),
  event: z.string().min(1),
  description: z.string().min(1).optional(),
});

export const EventChatActionSchema: z.ZodType<
  EventChatAction,
  EventChatAction
> = EventChatActionSchemaImpl;

export type ChatAction = PromptChatAction | EventChatAction;

export const ChatActionSchema: z.ZodType<ChatAction, ChatAction> =
  z.discriminatedUnion("type", [
    PromptChatActionSchemaImpl,
    EventChatActionSchemaImpl,
  ]);

export interface ActionsCard {
  kind: "actions";
  id: string;
  title?: string | undefined;
  defaultOpen?: boolean | undefined;
  actions: ChatAction[];
}

const ActionsCardSchemaImpl = z.object({
  kind: z.literal("actions"),
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  defaultOpen: z.boolean().optional(),
  actions: z.array(ChatActionSchema).min(1),
});

export const ActionsCardSchema: z.ZodType<ActionsCard, ActionsCard> =
  ActionsCardSchemaImpl;

export type StructuredChatCard =
  ToolApprovalCard | AttachmentCard | SourcesCard | ActionsCard;

export const StructuredChatCardSchema: z.ZodType<
  StructuredChatCard,
  StructuredChatCard
> = z.discriminatedUnion("kind", [
  ToolApprovalCardSchemaImpl,
  AttachmentCardSchemaImpl,
  SourcesCardSchemaImpl,
  ActionsCardSchemaImpl,
]);

export interface ToolResultErrorData {
  message: string;
  code?: string | undefined;
}

export interface ToolResultData {
  toolName: string;
  args?: Record<string, unknown> | undefined;
  jobId?: string | undefined;
  data?: unknown;
  error?: ToolResultErrorData | undefined;
}

export const ToolResultDataSchema: z.ZodType<ToolResultData, ToolResultData> =
  z.object({
    toolName: z.string(),
    args: z.record(z.string(), z.unknown()).optional(),
    jobId: z.string().optional(),
    data: z.unknown().optional(),
    error: z
      .object({
        message: z.string(),
        code: z.string().optional(),
      })
      .optional(),
  });

export interface AgentResponseUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface AgentResponse {
  text: string;
  toolResults?: ToolResultData[] | undefined;
  cards?: StructuredChatCard[] | undefined;
  pendingConfirmations?: PendingConfirmation[] | undefined;
  usage: AgentResponseUsage;
}

export const AgentResponseSchema: z.ZodType<AgentResponse, AgentResponse> =
  z.object({
    text: z.string(),
    toolResults: z.array(ToolResultDataSchema).optional(),
    cards: z.array(StructuredChatCardSchema).optional(),
    pendingConfirmations: z.array(PendingConfirmationSchema).optional(),
    usage: z.object({
      promptTokens: z.number(),
      completionTokens: z.number(),
      totalTokens: z.number(),
    }),
  });

export function parseAgentResponse(value: unknown): AgentResponse {
  return AgentResponseSchema.parse(stripUndefinedDeep(value));
}
