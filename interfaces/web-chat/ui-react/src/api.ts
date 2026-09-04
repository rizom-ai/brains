import {
  ChatApiError,
  type ChatClient,
  type ChatHistoryMessage,
  type ChatSession,
} from "@brains/contracts/chat";
import type { UIMessage } from "ai";
import { toUiMessages } from "./history-messages";

export type WebChatSession = ChatSession;

export function describeClientFailure(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof ChatApiError)) return fallback;
  if (error.status === 401 || error.status === 403) {
    return "Your operator session may have expired. Refresh or sign in again.";
  }
  return error.kind === "invalid-response"
    ? fallback
    : `${fallback} (${error.status})`;
}

export async function fetchWebChatHistory(
  conversationId: string,
  client: ChatClient,
): Promise<UIMessage[]> {
  let messages: ChatHistoryMessage[];
  try {
    messages = await client.getMessages(conversationId);
  } catch (error) {
    throw new Error(
      describeClientFailure(error, "Could not reopen that session."),
      { cause: error },
    );
  }
  return toUiMessages(messages);
}

export async function fetchWebChatSessions(
  client: ChatClient,
): Promise<WebChatSession[]> {
  try {
    return await client.listSessions();
  } catch (error) {
    throw new Error(
      describeClientFailure(error, "Could not load saved sessions."),
      { cause: error },
    );
  }
}
