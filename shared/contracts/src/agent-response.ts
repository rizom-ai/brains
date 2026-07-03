import { stripUndefinedDeep } from "@brains/utils/strip-undefined";
import { z } from "zod";

export const PendingConfirmationSchema = z.object({
  id: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string(),
  summary: z.string(),
  completionSummary: z.string().optional(),
  preview: z.string().optional(),
  args: z.unknown(),
});

export type PendingConfirmation = z.infer<typeof PendingConfirmationSchema>;

export const ToolApprovalCardStateSchema = z.enum([
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-denied",
  "output-error",
]);

export const ToolApprovalCardSchema = z.object({
  kind: z.literal("tool-approval"),
  id: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string(),
  input: z.record(z.unknown()).optional(),
  summary: z.string(),
  completionSummary: z.string().optional(),
  preview: z.string().optional(),
  state: ToolApprovalCardStateSchema,
  output: z.unknown().optional(),
  error: z.string().optional(),
});

export type ToolApprovalCardState = z.infer<typeof ToolApprovalCardStateSchema>;
export type ToolApprovalCard = z.infer<typeof ToolApprovalCardSchema>;

export const AttachmentCardSourceSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  attachmentType: z.string().optional(),
});

export const AttachmentCardDataSchema = z.object({
  mediaType: z.string().min(1),
  url: z.string().min(1),
  downloadUrl: z.string().min(1).optional(),
  previewUrl: z.string().min(1).optional(),
  filename: z.string().min(1).optional(),
  sizeBytes: z.number().nonnegative().optional(),
  source: AttachmentCardSourceSchema.optional(),
});

export const AttachmentCardSchema = z.object({
  kind: z.literal("attachment"),
  id: z.string(),
  jobId: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  attachment: AttachmentCardDataSchema,
});

export type AttachmentCardSource = z.infer<typeof AttachmentCardSourceSchema>;
export type AttachmentCardData = z.infer<typeof AttachmentCardDataSchema>;
export type AttachmentCard = z.infer<typeof AttachmentCardSchema>;

export const SourceCitationSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  source: z.string().min(1),
  url: z.string().min(1).optional(),
  entityType: z.string().min(1).optional(),
  entityId: z.string().min(1).optional(),
  excerpt: z.string().min(1).optional(),
  provenance: z.record(z.unknown()).optional(),
});

export type SourceCitation = z.infer<typeof SourceCitationSchema>;

export const SourcesCardSchema = z.object({
  kind: z.literal("sources"),
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  sources: z.array(SourceCitationSchema).min(1),
});

export type SourcesCard = z.infer<typeof SourcesCardSchema>;

export const PromptChatActionSchema = z.object({
  type: z.literal("prompt"),
  id: z.string().min(1),
  label: z.string().min(1),
  prompt: z.string().min(1),
  description: z.string().min(1).optional(),
});

export type PromptChatAction = z.infer<typeof PromptChatActionSchema>;

export const EventChatActionSchema = z.object({
  type: z.literal("event"),
  id: z.string().min(1),
  label: z.string().min(1),
  event: z.string().min(1),
  description: z.string().min(1).optional(),
});

export type EventChatAction = z.infer<typeof EventChatActionSchema>;

export const ChatActionSchema = z.discriminatedUnion("type", [
  PromptChatActionSchema,
  EventChatActionSchema,
]);

export type ChatAction = z.infer<typeof ChatActionSchema>;

export const ActionsCardSchema = z.object({
  kind: z.literal("actions"),
  id: z.string().min(1),
  title: z.string().min(1).optional(),
  defaultOpen: z.boolean().optional(),
  actions: z.array(ChatActionSchema).min(1),
});

export type ActionsCard = z.infer<typeof ActionsCardSchema>;

export const StructuredChatCardSchema = z.discriminatedUnion("kind", [
  ToolApprovalCardSchema,
  AttachmentCardSchema,
  SourcesCardSchema,
  ActionsCardSchema,
]);

export type StructuredChatCard = z.infer<typeof StructuredChatCardSchema>;

export const ToolResultDataSchema = z.object({
  toolName: z.string(),
  args: z.record(z.unknown()).optional(),
  jobId: z.string().optional(),
  data: z.unknown().optional(),
  error: z
    .object({
      message: z.string(),
      code: z.string().optional(),
    })
    .optional(),
});

export type ToolResultData = z.infer<typeof ToolResultDataSchema>;

export const AgentResponseSchema = z.object({
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

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export function parseAgentResponse(value: unknown): AgentResponse {
  return AgentResponseSchema.parse(stripUndefinedDeep(value));
}
