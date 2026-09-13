import {
  messageTextUploadMaxBytes,
  messageUploadMaxBytes,
} from "@brains/contracts/upload-policy";
import { type ChatCard } from "@brains/contracts/chat";

export const CHAT_UPLOAD_GUIDANCE: string = `Text/Markdown up to ${messageTextUploadMaxBytes / 1000} KB; PNG, JPEG, WebP, GIF or PDF up to ${messageUploadMaxBytes / 1000000} MB.`;

/** Cache keys for the session list and a conversation's messages. */
export const studioChatKeys: {
  sessions: readonly ["studio", "chat", "sessions"];
  messages: (
    conversationId: string,
  ) => readonly ["studio", "chat", "messages", string];
} = {
  sessions: ["studio", "chat", "sessions"] as const,
  messages: (conversationId: string) =>
    ["studio", "chat", "messages", conversationId] as const,
};

type ChatActionCard = Extract<ChatCard, { kind: "actions" }>;

export type ChatSuggestedAction = ChatActionCard["actions"][number];

export interface SessionView {
  query: string;
  archived: boolean;
  offset: number;
}

export interface ChatUploadAttempt {
  id: string;
  file: File;
  status: "uploading" | "failed";
  error?: string;
}
