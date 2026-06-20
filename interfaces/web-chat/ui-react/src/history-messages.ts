import type { UIMessage } from "ai";
import { z } from "@brains/utils/zod-v4";
import { stripInternalEntityMemoryNote } from "../../src/display-content";
import { createUploadPart, type WebChatUploadResponse } from "./uploads";

export const webChatHistoryAttachmentSourceSchema = z.looseObject({
  kind: z.string(),
  id: z.string(),
});

export const webChatHistoryAttachmentSchema = z.looseObject({
  kind: z.literal("text"),
  filename: z.string(),
  mediaType: z.string(),
  sizeBytes: z.number(),
  createdAt: z.string(),
  source: webChatHistoryAttachmentSourceSchema.optional(),
});

export const webChatHistoryAttachmentCardSchema = z.looseObject({
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

export const webChatHistorySourcesCardSchema = z.looseObject({
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

const webChatHistoryActionSchema = z.discriminatedUnion("type", [
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

export const webChatHistoryActionsCardSchema = z.looseObject({
  kind: z.literal("actions"),
  id: z.string(),
  title: z.string().optional(),
  defaultOpen: z.boolean().optional(),
  actions: z.array(webChatHistoryActionSchema),
});

export const webChatHistoryCardSchema = z.discriminatedUnion("kind", [
  webChatHistoryAttachmentCardSchema,
  webChatHistorySourcesCardSchema,
  webChatHistoryActionsCardSchema,
]);

export const webChatHistoryMessageSchema = z.looseObject({
  id: z.string(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  attachments: z.array(webChatHistoryAttachmentSchema).optional(),
  cards: z.array(webChatHistoryCardSchema).optional(),
});

export const webChatMessagesResponseSchema = z.looseObject({
  messages: z.array(webChatHistoryMessageSchema),
});

export type WebChatHistoryAttachmentSource = z.output<
  typeof webChatHistoryAttachmentSourceSchema
>;
export type WebChatHistoryAttachment = z.output<
  typeof webChatHistoryAttachmentSchema
>;
export type WebChatHistoryAttachmentCard = z.output<
  typeof webChatHistoryAttachmentCardSchema
>;
export type WebChatHistorySourcesCard = z.output<
  typeof webChatHistorySourcesCardSchema
>;
export type WebChatHistoryActionsCard = z.output<
  typeof webChatHistoryActionsCardSchema
>;
export type WebChatHistoryCard = z.output<typeof webChatHistoryCardSchema>;
export type WebChatHistoryMessage = z.output<
  typeof webChatHistoryMessageSchema
>;
export type WebChatMessagesResponse = z.output<
  typeof webChatMessagesResponseSchema
>;

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
