import { stripUndefinedDeep } from "@brains/utils/strip-undefined";
import { z } from "@brains/utils/zod";

type PendingConfirmationSchema = z.ZodObject<{
  id: z.ZodString;
  toolCallId: z.ZodOptional<z.ZodString>;
  toolName: z.ZodString;
  summary: z.ZodString;
  completionSummary: z.ZodOptional<z.ZodString>;
  preview: z.ZodOptional<z.ZodString>;
  args: z.ZodUnknown;
}>;

export const PendingConfirmationSchema: PendingConfirmationSchema = z.object({
  id: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string(),
  summary: z.string(),
  completionSummary: z.string().optional(),
  preview: z.string().optional(),
  args: z.unknown(),
});

export type PendingConfirmation = z.output<typeof PendingConfirmationSchema>;

type ToolApprovalCardStateSchema = z.ZodEnum<{
  "approval-requested": "approval-requested";
  "approval-responded": "approval-responded";
  "output-available": "output-available";
  "output-denied": "output-denied";
  "output-error": "output-error";
}>;

export const ToolApprovalCardStateSchema: ToolApprovalCardStateSchema = z.enum([
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-denied",
  "output-error",
]);

export type ToolApprovalCardState = z.output<
  typeof ToolApprovalCardStateSchema
>;

type ToolApprovalCardSchema = z.ZodObject<{
  kind: z.ZodLiteral<"tool-approval">;
  id: z.ZodString;
  toolCallId: z.ZodOptional<z.ZodString>;
  toolName: z.ZodString;
  input: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  summary: z.ZodString;
  completionSummary: z.ZodOptional<z.ZodString>;
  preview: z.ZodOptional<z.ZodString>;
  state: ToolApprovalCardStateSchema;
  output: z.ZodOptional<z.ZodUnknown>;
  error: z.ZodOptional<z.ZodString>;
}>;

export const ToolApprovalCardSchema: ToolApprovalCardSchema = z.object({
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

export type ToolApprovalCard = z.output<typeof ToolApprovalCardSchema>;

type AttachmentCardSourceSchema = z.ZodObject<{
  entityType: z.ZodOptional<z.ZodString>;
  entityId: z.ZodOptional<z.ZodString>;
  attachmentType: z.ZodOptional<z.ZodString>;
}>;

export const AttachmentCardSourceSchema: AttachmentCardSourceSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  attachmentType: z.string().optional(),
});

export type AttachmentCardSource = z.output<typeof AttachmentCardSourceSchema>;

type AttachmentCardDataSchema = z.ZodObject<{
  mediaType: z.ZodString;
  url: z.ZodString;
  downloadUrl: z.ZodOptional<z.ZodString>;
  previewUrl: z.ZodOptional<z.ZodString>;
  filename: z.ZodOptional<z.ZodString>;
  sizeBytes: z.ZodOptional<z.ZodNumber>;
  source: z.ZodOptional<AttachmentCardSourceSchema>;
}>;

export const AttachmentCardDataSchema: AttachmentCardDataSchema = z.object({
  mediaType: z.string().min(1),
  url: z.string().min(1),
  downloadUrl: z.string().min(1).optional(),
  previewUrl: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  sizeBytes: z.number().nonnegative().optional(),
  source: AttachmentCardSourceSchema.optional(),
});

export type AttachmentCardData = z.output<typeof AttachmentCardDataSchema>;

type AttachmentCardSchema = z.ZodObject<{
  kind: z.ZodLiteral<"attachment">;
  id: z.ZodString;
  jobId: z.ZodOptional<z.ZodString>;
  title: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
  attachment: AttachmentCardDataSchema;
}>;

export const AttachmentCardSchema: AttachmentCardSchema = z.object({
  kind: z.literal("attachment"),
  id: z.string(),
  jobId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  attachment: AttachmentCardDataSchema,
});

export type AttachmentCard = z.output<typeof AttachmentCardSchema>;

type SourceCitationSchema = z.ZodObject<{
  id: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  source: z.ZodString;
  url: z.ZodOptional<z.ZodString>;
  entityType: z.ZodOptional<z.ZodString>;
  entityId: z.ZodOptional<z.ZodString>;
  excerpt: z.ZodOptional<z.ZodString>;
  provenance: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}>;

export const SourceCitationSchema: SourceCitationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  source: z.string().min(1),
  url: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  excerpt: z.string().min(1).optional(),
  provenance: z.record(z.string(), z.unknown()).optional(),
});

export type SourceCitation = z.output<typeof SourceCitationSchema>;

type SourcesCardSchema = z.ZodObject<{
  kind: z.ZodLiteral<"sources">;
  id: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  sources: z.ZodArray<SourceCitationSchema>;
}>;

export const SourcesCardSchema: SourcesCardSchema = z.object({
  kind: z.literal("sources"),
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  sources: z.array(SourceCitationSchema).min(1),
});

export type SourcesCard = z.output<typeof SourcesCardSchema>;

type PromptChatActionSchema = z.ZodObject<{
  type: z.ZodLiteral<"prompt">;
  id: z.ZodString;
  label: z.ZodString;
  prompt: z.ZodString;
  description: z.ZodOptional<z.ZodString>;
}>;

export const PromptChatActionSchema: PromptChatActionSchema = z.object({
  type: z.literal("prompt"),
  id: z.string().min(1),
  label: z.string().min(1),
  prompt: z.string().min(1),
  description: z.string().min(1).optional(),
});

export type PromptChatAction = z.output<typeof PromptChatActionSchema>;

type EventChatActionSchema = z.ZodObject<{
  type: z.ZodLiteral<"event">;
  id: z.ZodString;
  label: z.ZodString;
  event: z.ZodString;
  fromState: z.ZodOptional<z.ZodString>;
  description: z.ZodOptional<z.ZodString>;
}>;

export const EventChatActionSchema: EventChatActionSchema = z.object({
  type: z.literal("event"),
  id: z.string().min(1),
  label: z.string().min(1),
  event: z.string().min(1),
  /** State id the action was rendered for; echoed back so stale clicks can be rejected. */
  fromState: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

export type EventChatAction = z.output<typeof EventChatActionSchema>;

type ChatActionSchema = z.ZodDiscriminatedUnion<
  [PromptChatActionSchema, EventChatActionSchema]
>;

export const ChatActionSchema: ChatActionSchema = z.discriminatedUnion("type", [
  PromptChatActionSchema,
  EventChatActionSchema,
]);

export type ChatAction = z.output<typeof ChatActionSchema>;

type ActionsCardSchema = z.ZodObject<{
  kind: z.ZodLiteral<"actions">;
  id: z.ZodString;
  title: z.ZodOptional<z.ZodString>;
  defaultOpen: z.ZodOptional<z.ZodBoolean>;
  actions: z.ZodArray<ChatActionSchema>;
}>;

export const ActionsCardSchema: ActionsCardSchema = z.object({
  kind: z.literal("actions"),
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  defaultOpen: z.boolean().optional(),
  actions: z.array(ChatActionSchema).min(1),
});

export type ActionsCard = z.output<typeof ActionsCardSchema>;

type StructuredChatCardSchema = z.ZodDiscriminatedUnion<
  [
    ToolApprovalCardSchema,
    AttachmentCardSchema,
    SourcesCardSchema,
    ActionsCardSchema,
  ]
>;

export const StructuredChatCardSchema: StructuredChatCardSchema =
  z.discriminatedUnion("kind", [
    ToolApprovalCardSchema,
    AttachmentCardSchema,
    SourcesCardSchema,
    ActionsCardSchema,
  ]);

export type StructuredChatCard = z.output<typeof StructuredChatCardSchema>;

type ToolResultErrorDataSchema = z.ZodObject<{
  message: z.ZodString;
  code: z.ZodOptional<z.ZodString>;
}>;

type ToolResultDataSchema = z.ZodObject<{
  toolName: z.ZodString;
  args: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
  jobId: z.ZodOptional<z.ZodString>;
  data: z.ZodOptional<z.ZodUnknown>;
  error: z.ZodOptional<ToolResultErrorDataSchema>;
}>;

export const ToolResultDataSchema: ToolResultDataSchema = z.object({
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

export type ToolResultData = z.output<typeof ToolResultDataSchema>;
export type ToolResultErrorData = z.output<ToolResultErrorDataSchema>;

type AgentResponseUsageSchema = z.ZodObject<{
  promptTokens: z.ZodNumber;
  completionTokens: z.ZodNumber;
  totalTokens: z.ZodNumber;
}>;

type AgentResponseSchema = z.ZodObject<{
  text: z.ZodString;
  toolResults: z.ZodOptional<z.ZodArray<ToolResultDataSchema>>;
  cards: z.ZodOptional<z.ZodArray<StructuredChatCardSchema>>;
  pendingConfirmations: z.ZodOptional<z.ZodArray<PendingConfirmationSchema>>;
  usage: AgentResponseUsageSchema;
}>;

export const AgentResponseSchema: AgentResponseSchema = z.object({
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

export type AgentResponse = z.output<typeof AgentResponseSchema>;
export type AgentResponseUsage = z.output<AgentResponseUsageSchema>;

export function parseAgentResponse(value: unknown): AgentResponse {
  return AgentResponseSchema.parse(stripUndefinedDeep(value));
}
