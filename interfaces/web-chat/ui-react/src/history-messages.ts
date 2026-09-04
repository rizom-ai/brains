import {
  ActionsCardSchema,
  AttachmentCardSchema,
  SourcesCardSchema,
  StructuredChatCardSchema,
  type ActionsCard,
  type AttachmentCard,
  type AttachmentCardData,
  type AttachmentCardSource,
  type ChatAction,
  type SourceCitation,
  type SourcesCard,
  type StructuredChatCard,
  type ToolApprovalCard,
} from "@brains/contracts";
import {
  chatHistoryAttachmentSchema,
  chatHistoryAttachmentSourceSchema,
  chatHistoryMessageSchema,
  chatMessagesResponseSchema,
  type ChatHistoryAttachment,
  type ChatHistoryAttachmentSource,
  type ChatHistoryMessage,
  type ChatMessagesResponse,
} from "@brains/contracts/chat";
import type { DynamicToolUIPart, UIMessage } from "ai";
import { stripInternalEntityMemoryNote } from "../../src/display-content";
import { createWebChatClient } from "./web-chat-client";
import { createUploadPart, type WebChatUploadResponse } from "./uploads";

const chatClient = createWebChatClient();

export type WebChatHistoryAttachmentSource = ChatHistoryAttachmentSource;
export type WebChatHistoryAttachment = ChatHistoryAttachment;
export type WebChatHistoryAttachmentCardSource = AttachmentCardSource;
export type WebChatHistoryAttachmentCardAttachment = AttachmentCardData;
export type WebChatHistoryAttachmentCard = AttachmentCard;
export type WebChatHistorySourceEntry = SourceCitation;
export type WebChatHistorySourcesCard = SourcesCard;
export type WebChatHistoryAction = ChatAction;
export type WebChatHistoryActionsCard = ActionsCard;
export type WebChatHistoryCard = StructuredChatCard;
export type WebChatHistoryMessage = ChatHistoryMessage;
export type WebChatMessagesResponse = ChatMessagesResponse;

export const webChatHistoryAttachmentSourceSchema: typeof chatHistoryAttachmentSourceSchema =
  chatHistoryAttachmentSourceSchema;
export const webChatHistoryAttachmentSchema: typeof chatHistoryAttachmentSchema =
  chatHistoryAttachmentSchema;
export const webChatHistoryAttachmentCardSchema: typeof AttachmentCardSchema =
  AttachmentCardSchema;
export const webChatHistorySourcesCardSchema: typeof SourcesCardSchema =
  SourcesCardSchema;
export const webChatHistoryActionsCardSchema: typeof ActionsCardSchema =
  ActionsCardSchema;
export const webChatHistoryCardSchema: typeof StructuredChatCardSchema =
  StructuredChatCardSchema;
export const webChatHistoryMessageSchema: typeof chatHistoryMessageSchema =
  chatHistoryMessageSchema;
export const webChatMessagesResponseSchema: typeof chatMessagesResponseSchema =
  chatMessagesResponseSchema;

/**
 * The query cache owns an immutable history snapshot. AI SDK receives a
 * detached seed and exclusively owns all active and streaming mutations.
 */
export function createActiveMessageSeed(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({
    ...message,
    parts: [...message.parts],
  }));
}

function toToolApprovalPart(card: ToolApprovalCard): DynamicToolUIPart {
  const common = {
    type: "dynamic-tool" as const,
    toolCallId: card.toolCallId ?? card.id,
    toolName: card.toolName,
    title: card.preview ? `${card.summary}\n\n${card.preview}` : card.summary,
    input: card.input ?? {},
  };

  switch (card.state) {
    case "approval-requested":
      return {
        ...common,
        state: "approval-requested",
        approval: { id: card.id },
      };
    case "approval-responded":
      // Stored cards do not retain the approval decision, so render this
      // transient state without offering the action again.
      return { ...common, state: "input-available" };
    case "output-available":
      return { ...common, state: "output-available", output: card.output };
    case "output-error":
      return {
        ...common,
        state: "output-error",
        errorText: card.error ?? "Tool failed",
      };
    case "output-denied":
      return {
        ...common,
        state: "output-denied",
        approval: { id: card.id, approved: false },
      };
  }
}

interface ResolvedApprovalKeys {
  ids: ReadonlySet<string>;
  toolCallIds: ReadonlySet<string>;
}

function collectResolvedApprovalKeys(
  messages: readonly WebChatHistoryMessage[],
): ResolvedApprovalKeys {
  const ids = new Set<string>();
  const toolCallIds = new Set<string>();

  for (const message of messages) {
    for (const card of message.cards ?? []) {
      if (
        card.kind !== "tool-approval" ||
        card.state === "approval-requested"
      ) {
        continue;
      }
      ids.add(card.id);
      if (card.toolCallId) toolCallIds.add(card.toolCallId);
    }
  }

  return { ids, toolCallIds };
}

function isResolvedApprovalRequest(
  card: ToolApprovalCard,
  resolved: ResolvedApprovalKeys | undefined,
): boolean {
  return Boolean(
    resolved &&
    card.state === "approval-requested" &&
    (resolved.ids.has(card.id) ||
      (card.toolCallId !== undefined &&
        resolved.toolCallIds.has(card.toolCallId))),
  );
}

function toUiMessageWithResolvedApprovals(
  message: WebChatHistoryMessage,
  resolved: ResolvedApprovalKeys | undefined,
): UIMessage {
  const parts: UIMessage["parts"] = [];
  const displayContent = stripInternalEntityMemoryNote(message.content);
  if (displayContent.length > 0) {
    parts.push({ type: "text", text: displayContent });
  }
  for (const attachment of message.attachments ?? []) {
    const upload = toUploadResponse(attachment);
    if (upload) parts.push(createUploadPart(upload));
  }
  for (const card of message.cards ?? []) {
    if (card.kind === "tool-approval") {
      if (isResolvedApprovalRequest(card, resolved)) continue;
      parts.push(toToolApprovalPart(card));
      continue;
    }
    parts.push({
      type:
        card.kind === "sources"
          ? "data-sources"
          : card.kind === "actions"
            ? "data-actions"
            : "data-attachment",
      data: card,
    });
  }

  return {
    id: message.id,
    role: message.role,
    parts,
  };
}

export function toUiMessage(message: WebChatHistoryMessage): UIMessage {
  return toUiMessageWithResolvedApprovals(message, undefined);
}

export function toUiMessages(
  messages: readonly WebChatHistoryMessage[],
): UIMessage[] {
  // History is append-only: the request card remains on its original message
  // and the terminal card is stored on a later message. Reconcile both before
  // hydrating AI SDK state so the original buttons do not become active again.
  const resolved = collectResolvedApprovalKeys(messages);
  return messages.map((message) =>
    toUiMessageWithResolvedApprovals(message, resolved),
  );
}

function toUploadResponse(
  attachment: WebChatHistoryAttachment,
): WebChatUploadResponse | null {
  if (attachment.source?.kind !== "upload") return null;
  return {
    id: attachment.source.id,
    ref: { kind: "upload", id: attachment.source.id },
    filename: attachment.filename,
    mediaType: attachment.mediaType,
    sizeBytes: attachment.sizeBytes,
    createdAt: attachment.createdAt,
    url: getUploadUrl(attachment.source.id),
    downloadUrl: getUploadUrl(attachment.source.id, true),
  };
}

function getUploadUrl(uploadId: string, download = false): string {
  return chatClient.getUploadUrl(uploadId, download);
}
