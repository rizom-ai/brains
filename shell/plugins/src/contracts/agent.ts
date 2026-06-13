import { UserPermissionLevelSchema } from "@brains/templates";
import { z } from "zod";
import {
  conversationMessageActorSchema,
  conversationMessageSourceSchema,
} from "@brains/conversation-service";
import type { AgentResponse } from "@brains/contracts";
export {
  ActionsCardSchema,
  AgentResponseSchema,
  AttachmentCardDataSchema,
  AttachmentCardSchema,
  AttachmentCardSourceSchema,
  ChatActionSchema,
  EventChatActionSchema,
  PendingConfirmationSchema,
  PromptChatActionSchema,
  SourceCitationSchema,
  SourcesCardSchema,
  StructuredChatCardSchema,
  ToolApprovalCardSchema,
  ToolApprovalCardStateSchema,
  ToolResultDataSchema,
} from "@brains/contracts";
export type {
  ActionsCard,
  AgentResponse,
  AttachmentCard,
  AttachmentCardData,
  AttachmentCardSource,
  ChatAction,
  EventChatAction,
  PendingConfirmation,
  PromptChatAction,
  SourceCitation,
  SourcesCard,
  StructuredChatCard,
  ToolApprovalCard,
  ToolApprovalCardState,
  ToolResultData,
} from "@brains/contracts";

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
