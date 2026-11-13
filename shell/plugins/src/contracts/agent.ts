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

export {
  ChatAttachmentSchema,
  ChatAttachmentSourceSchema,
  ChatContextSchema,
  FileChatAttachmentSchema,
  TextChatAttachmentSchema,
  type ChatAttachment,
  type ChatContext,
} from "@brains/ai-service";
import type { ChatContext } from "@brains/ai-service";

export interface AgentNamespace {
  /** Guest turns can run: the search index they read is ready. */
  readonly guestReady?: boolean;
  chat(
    message: string,
    conversationId: string,
    context?: ChatContext,
    signal?: AbortSignal,
  ): Promise<AgentResponse>;
  confirmPendingAction(
    conversationId: string,
    confirmed: boolean,
    approvalId: string,
    context: ChatContext,
    signal?: AbortSignal,
  ): Promise<AgentResponse>;
  invalidate(): void;
}
