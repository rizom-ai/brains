import { UserPermissionLevelSchema } from "@brains/templates";
import { z } from "zod";
import {
  conversationMessageActorSchema,
  conversationMessageSourceSchema,
} from "@brains/conversation-service";

export const ChatAttachmentSourceSchema = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
});

export const TextChatAttachmentSchema = z.object({
  kind: z.literal("text"),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  content: z.string(),
  sizeBytes: z.number().nonnegative().optional(),
  source: ChatAttachmentSourceSchema.optional(),
});

const fileAttachmentDataSchema: z.ZodType<Uint8Array> =
  z.instanceof(Uint8Array);

export const FileChatAttachmentSchema = z.object({
  kind: z.literal("file"),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  data: fileAttachmentDataSchema,
  sizeBytes: z.number().nonnegative().optional(),
  source: ChatAttachmentSourceSchema.optional(),
});

export const ChatAttachmentSchema = z.discriminatedUnion("kind", [
  TextChatAttachmentSchema,
  FileChatAttachmentSchema,
]);

export type ChatAttachment = z.infer<typeof ChatAttachmentSchema>;

export const ChatContextSchema = z.object({
  userPermissionLevel: UserPermissionLevelSchema.optional(),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  actor: conversationMessageActorSchema.optional(),
  source: conversationMessageSourceSchema.optional(),
  attachments: z.array(ChatAttachmentSchema).optional(),
});

export type ChatContext = z.infer<typeof ChatContextSchema>;

export const PendingConfirmationSchema = z.object({
  id: z.string(),
  toolCallId: z.string().optional(),
  toolName: z.string(),
  summary: z.string(),
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
  preview: z.string().optional(),
  state: ToolApprovalCardStateSchema,
  output: z.unknown().optional(),
  error: z.string().optional(),
});

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

export type AttachmentCard = z.infer<typeof AttachmentCardSchema>;

export const StructuredChatCardSchema = z.discriminatedUnion("kind", [
  ToolApprovalCardSchema,
  AttachmentCardSchema,
]);

export type StructuredChatCard = z.infer<typeof StructuredChatCardSchema>;

/**
 * Project an attachment card to its public shape, dropping undefined optional
 * fields. Shared by every boundary that re-maps a card (public agent service,
 * remote agent service) so the nested optional-stripping lives in one place.
 * Accepts any structurally-compatible attachment card (runtime or parsed).
 */
export function toPublicAttachmentCard(card: AttachmentCard): AttachmentCard {
  const { attachment } = card;
  const { source } = attachment;
  return {
    kind: "attachment",
    id: card.id,
    ...(card.jobId !== undefined && { jobId: card.jobId }),
    title: card.title,
    ...(card.description !== undefined && { description: card.description }),
    attachment: {
      mediaType: attachment.mediaType,
      url: attachment.url,
      ...(attachment.downloadUrl !== undefined && {
        downloadUrl: attachment.downloadUrl,
      }),
      ...(attachment.previewUrl !== undefined && {
        previewUrl: attachment.previewUrl,
      }),
      ...(attachment.filename !== undefined && {
        filename: attachment.filename,
      }),
      ...(attachment.sizeBytes !== undefined && {
        sizeBytes: attachment.sizeBytes,
      }),
      ...(source !== undefined && {
        source: {
          ...(source.entityType !== undefined && {
            entityType: source.entityType,
          }),
          ...(source.entityId !== undefined && { entityId: source.entityId }),
          ...(source.attachmentType !== undefined && {
            attachmentType: source.attachmentType,
          }),
        },
      }),
    },
  };
}

export const ToolResultDataSchema = z.object({
  toolName: z.string(),
  args: z.record(z.unknown()).optional(),
  jobId: z.string().optional(),
  data: z.unknown().optional(),
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

export interface AgentNamespace {
  chat(
    message: string,
    conversationId: string,
    context?: ChatContext,
  ): Promise<AgentResponse>;
  confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
    approvalId: string,
  ): Promise<AgentResponse>;
  invalidate(): void;
}
