import type { UseQueryOptions } from "@tanstack/react-query";
import type { UIMessage } from "ai";
import {
  fetchWebChatHistory,
  fetchWebChatSessions,
  type WebChatSession,
} from "./api";

export type SessionListQueryKey = readonly ["web-chat", "sessions"];
export type SessionHistoryQueryKey = readonly ["web-chat", "history", string];

export const webChatKeys = {
  all: ["web-chat"] as const,
  sessions: (): SessionListQueryKey => ["web-chat", "sessions"],
  history: (conversationId: string): SessionHistoryQueryKey => [
    "web-chat",
    "history",
    conversationId,
  ],
};

export function sessionHistoryQueryOptions(
  conversationId: string,
): UseQueryOptions<UIMessage[], Error, UIMessage[], SessionHistoryQueryKey> {
  return {
    queryKey: webChatKeys.history(conversationId),
    queryFn: () => fetchWebChatHistory(conversationId),
  };
}

export function sessionListQueryOptions(): UseQueryOptions<
  WebChatSession[],
  Error,
  WebChatSession[],
  SessionListQueryKey
> {
  return {
    queryKey: webChatKeys.sessions(),
    queryFn: fetchWebChatSessions,
  };
}
