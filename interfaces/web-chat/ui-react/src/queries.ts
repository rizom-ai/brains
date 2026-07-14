import type { UseQueryOptions } from "@tanstack/react-query";
import { fetchWebChatSessions, type WebChatSession } from "./api";

export type SessionListQueryKey = readonly ["web-chat", "sessions"];

export const webChatKeys = {
  all: ["web-chat"] as const,
  sessions: (): SessionListQueryKey => ["web-chat", "sessions"],
};

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
