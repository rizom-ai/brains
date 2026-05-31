import type { UIMessage } from "ai";
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

export interface WebChatHistoryMessage {
  id: string;
  role: UIMessage["role"];
  content: string;
  attachments?: WebChatHistoryAttachment[];
}

export interface WebChatMessagesResponse {
  messages: WebChatHistoryMessage[];
}

export function toUiMessage(message: WebChatHistoryMessage): UIMessage {
  const parts: UIMessage["parts"] = [];
  if (message.content.length > 0) {
    parts.push({ type: "text", text: message.content });
  }
  for (const attachment of message.attachments ?? []) {
    const upload = toUploadResponse(attachment);
    if (upload) parts.push(createUploadPart(upload));
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
  if (attachment.source?.kind !== "web-chat-upload") return null;
  return {
    id: attachment.source.id,
    ref: { kind: "web-chat-upload", id: attachment.source.id },
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
