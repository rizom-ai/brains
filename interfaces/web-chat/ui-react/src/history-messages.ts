import type { UIMessage } from "ai";
import { stripInternalEntityMemoryNote } from "../../src/display-content";
import { createUploadPart, type WebChatUploadResponse } from "./uploads";

export interface WebChatHistoryAttachmentSource {
  kind: string;
  id: string;
}

export interface WebChatHistoryAttachment {
  kind: "text";
  filename: string;
  mediaType: string;
  sizeBytes: number;
  createdAt: string;
  source?: WebChatHistoryAttachmentSource;
}

export interface WebChatHistoryAttachmentCard {
  kind: "attachment";
  id: string;
  jobId?: string | undefined;
  title: string;
  description?: string | undefined;
  attachment: {
    mediaType: string;
    url: string;
    downloadUrl?: string | undefined;
    previewUrl?: string | undefined;
    filename?: string | undefined;
    sizeBytes?: number | undefined;
    source?:
      | {
          entityType?: string | undefined;
          entityId?: string | undefined;
          attachmentType?: string | undefined;
        }
      | undefined;
  };
}

export interface WebChatHistoryMessage {
  id: string;
  role: UIMessage["role"];
  content: string;
  attachments?: WebChatHistoryAttachment[];
  cards?: WebChatHistoryAttachmentCard[];
}

export interface WebChatMessagesResponse {
  messages: WebChatHistoryMessage[];
}

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
    parts.push({ type: "data-attachment", data: card });
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
