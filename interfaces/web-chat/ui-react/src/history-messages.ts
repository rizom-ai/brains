import type { UIMessage } from "ai";
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

export interface WebChatHistoryAttachmentCardSource {
  [key: string]: unknown;
  entityType?: string | undefined;
  entityId?: string | undefined;
  attachmentType?: string | undefined;
}

export interface WebChatHistoryAttachmentCardAttachment {
  [key: string]: unknown;
  mediaType: string;
  url: string;
  downloadUrl?: string | undefined;
  previewUrl?: string | undefined;
  filename?: string | undefined;
  sizeBytes?: number | undefined;
  source?: WebChatHistoryAttachmentCardSource | undefined;
}

export interface WebChatHistoryAttachmentCard {
  [key: string]: unknown;
  kind: "attachment";
  id: string;
  jobId?: string | undefined;
  title: string;
  description?: string | undefined;
  attachment: WebChatHistoryAttachmentCardAttachment;
}

export interface WebChatHistorySourceEntry {
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

export interface WebChatHistorySourcesCard {
  [key: string]: unknown;
  kind: "sources";
  id: string;
  title?: string | undefined;
  sources: WebChatHistorySourceEntry[];
}

export type WebChatHistoryAction =
  | {
      [key: string]: unknown;
      type: "prompt";
      id: string;
      label: string;
      prompt: string;
      description?: string | undefined;
    }
  | {
      [key: string]: unknown;
      type: "event";
      id: string;
      label: string;
      event: string;
      description?: string | undefined;
    };

export interface WebChatHistoryActionsCard {
  [key: string]: unknown;
  kind: "actions";
  id: string;
  title?: string | undefined;
  defaultOpen?: boolean | undefined;
  actions: WebChatHistoryAction[];
}

export type WebChatHistoryCard =
  | WebChatHistoryAttachmentCard
  | WebChatHistorySourcesCard
  | WebChatHistoryActionsCard;

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
  z.looseObject({
    kind: z.literal("attachment"),
    id: z.string(),
    jobId: z.string().optional(),
    title: z.string(),
    description: z.string().optional(),
    attachment: z.looseObject({
      mediaType: z.string(),
      url: z.string(),
      downloadUrl: z.string().optional(),
      previewUrl: z.string().optional(),
      filename: z.string().optional(),
      sizeBytes: z.number().optional(),
      source: z
        .looseObject({
          entityType: z.string().optional(),
          entityId: z.string().optional(),
          attachmentType: z.string().optional(),
        })
        .optional(),
    }),
  });

export const webChatHistorySourcesCardSchema: z.ZodType<WebChatHistorySourcesCard> =
  z.looseObject({
    kind: z.literal("sources"),
    id: z.string(),
    title: z.string().optional(),
    sources: z.array(
      z.looseObject({
        id: z.string(),
        title: z.string().optional(),
        source: z.string(),
        url: z.string().optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        excerpt: z.string().optional(),
        provenance: z.record(z.string(), z.unknown()).optional(),
      }),
    ),
  });

const webChatHistoryActionSchema: z.ZodType<WebChatHistoryAction> =
  z.discriminatedUnion("type", [
    z.looseObject({
      type: z.literal("prompt"),
      id: z.string(),
      label: z.string(),
      prompt: z.string(),
      description: z.string().optional(),
    }),
    z.looseObject({
      type: z.literal("event"),
      id: z.string(),
      label: z.string(),
      event: z.string(),
      description: z.string().optional(),
    }),
  ]);

export const webChatHistoryActionsCardSchema: z.ZodType<WebChatHistoryActionsCard> =
  z.looseObject({
    kind: z.literal("actions"),
    id: z.string(),
    title: z.string().optional(),
    defaultOpen: z.boolean().optional(),
    actions: z.array(webChatHistoryActionSchema),
  });

export const webChatHistoryCardSchema: z.ZodType<WebChatHistoryCard> = z.union([
  webChatHistoryAttachmentCardSchema,
  webChatHistorySourcesCardSchema,
  webChatHistoryActionsCardSchema,
]);

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

export function toUiMessage(message: WebChatHistoryMessage): UIMessage {
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
