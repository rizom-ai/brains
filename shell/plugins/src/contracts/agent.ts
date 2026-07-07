import { z } from "@brains/utils/zod";
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

export const ChatAttachmentSourceSchema: z.ZodObject<{
  kind: z.ZodString;
  id: z.ZodString;
}> = z.object({
  kind: z.string().min(1),
  id: z.string().min(1),
});

export const TextChatAttachmentSchema: z.ZodObject<{
  kind: z.ZodLiteral<"text">;
  filename: z.ZodString;
  mediaType: z.ZodString;
  content: z.ZodString;
  sizeBytes: z.ZodOptional<z.ZodNumber>;
  source: z.ZodOptional<typeof ChatAttachmentSourceSchema>;
}> = z.object({
  kind: z.literal("text"),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  content: z.string(),
  sizeBytes: z.number().nonnegative().optional(),
  source: ChatAttachmentSourceSchema.optional(),
});

const fileAttachmentDataSchema: z.ZodType<Uint8Array, unknown> =
  z.custom<Uint8Array>((value) => value instanceof Uint8Array);

export const FileChatAttachmentSchema: z.ZodObject<{
  kind: z.ZodLiteral<"file">;
  filename: z.ZodString;
  mediaType: z.ZodString;
  data: typeof fileAttachmentDataSchema;
  sizeBytes: z.ZodOptional<z.ZodNumber>;
  source: z.ZodOptional<typeof ChatAttachmentSourceSchema>;
}> = z.object({
  kind: z.literal("file"),
  filename: z.string().min(1),
  mediaType: z.string().min(1),
  data: fileAttachmentDataSchema,
  sizeBytes: z.number().nonnegative().optional(),
  source: ChatAttachmentSourceSchema.optional(),
});

export const ChatAttachmentSchema: z.ZodDiscriminatedUnion<
  [typeof TextChatAttachmentSchema, typeof FileChatAttachmentSchema],
  "kind"
> = z.discriminatedUnion("kind", [
  TextChatAttachmentSchema,
  FileChatAttachmentSchema,
]);

export type ChatAttachment = z.output<typeof ChatAttachmentSchema>;

export interface ChatContext {
  userPermissionLevel?: "anchor" | "trusted" | "public" | undefined;
  interfaceType?: string | undefined;
  channelId?: string | undefined;
  channelName?: string | undefined;
  actor?:
    | {
        actorId: string;
        canonicalId?: string | undefined;
        interfaceType: string;
        role: "user" | "assistant";
        displayName?: string | undefined;
        username?: string | undefined;
        isBot?: boolean | undefined;
      }
    | undefined;
  source?:
    | {
        messageId?: string | undefined;
        channelId?: string | undefined;
        channelName?: string | undefined;
        threadId?: string | undefined;
        metadata?: Record<string, unknown> | undefined;
      }
    | undefined;
  attachments?: ChatAttachment[] | undefined;
}

export const ChatContextSchema: z.ZodType<ChatContext, unknown> = z.object({
  userPermissionLevel: z.enum(["anchor", "trusted", "public"]).optional(),
  interfaceType: z.string().optional(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  actor: conversationMessageActorSchema.optional(),
  source: conversationMessageSourceSchema.optional(),
  attachments: z.array(ChatAttachmentSchema).optional(),
});

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
    context: ChatContext,
  ): Promise<AgentResponse>;
  invalidate(): void;
}
