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
import type { DynamicToolUIPart, UIMessage } from "ai";
import { z } from "@brains/utils/zod";
import { stripInternalEntityMemoryNote } from "../../src/display-content";
import { createUploadPart, type WebChatUploadResponse } from "./uploads";

export interface WebChatHistoryAttachmentSource {
  [key: string]: unknown;
  kind: string;
  id: string;
}

export interface WebChatHistoryAttachment {
  [key: string]: unknown;
  kind: "text";
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  source?: WebChatHistoryAttachmentSource | undefined;
}

export type WebChatHistoryAttachmentCardSource = AttachmentCardSource;
export type WebChatHistoryAttachmentCardAttachment = AttachmentCardData;
export type WebChatHistoryAttachmentCard = AttachmentCard;
export type WebChatHistorySourceEntry = SourceCitation;
export type WebChatHistorySourcesCard = SourcesCard;
export type WebChatHistoryAction = ChatAction;
export type WebChatHistoryActionsCard = ActionsCard;
export type WebChatHistoryCard = StructuredChatCard;

export interface WebChatHistoryMessage {
  [key: string]: unknown;
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: WebChatHistoryAttachment[] | undefined;
  cards?: WebChatHistoryCard[] | undefined;
}

export interface WebChatMessagesResponse {
  [key: string]: unknown;
  messages: WebChatHistoryMessage[];
}

export const webChatHistoryAttachmentSourceSchema: z.ZodType<WebChatHistoryAttachmentSource> =
  z.looseObject({
    kind: z.string(),
    id: z.string(),
  });

export const webChatHistoryAttachmentSchema: z.ZodType<WebChatHistoryAttachment> =
  z.looseObject({
    kind: z.literal("text"),
    filename: z.string(),
    mediaType: z.string(),
    sizeBytes: z.number(),
    createdAt: z.string(),
    source: webChatHistoryAttachmentSourceSchema.optional(),
  });

export const webChatHistoryAttachmentCardSchema: z.ZodType<WebChatHistoryAttachmentCard> =
  AttachmentCardSchema;
export const webChatHistorySourcesCardSchema: z.ZodType<WebChatHistorySourcesCard> =
  SourcesCardSchema;
export const webChatHistoryActionsCardSchema: z.ZodType<WebChatHistoryActionsCard> =
  ActionsCardSchema;
export const webChatHistoryCardSchema: z.ZodType<WebChatHistoryCard> =
  StructuredChatCardSchema;

export const webChatHistoryMessageSchema: z.ZodType<WebChatHistoryMessage> =
  z.looseObject({
    id: z.string(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    attachments: z.array(webChatHistoryAttachmentSchema).optional(),
    cards: z.array(webChatHistoryCardSchema).optional(),
  });

export const webChatMessagesResponseSchema: z.ZodType<WebChatMessagesResponse> =
  z.looseObject({
    messages: z.array(webChatHistoryMessageSchema),
  });

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
  const encodedId = encodeURIComponent(uploadId);
  return `/api/chat/uploads?id=${encodedId}${download ? "&download=1" : ""}`;
}
