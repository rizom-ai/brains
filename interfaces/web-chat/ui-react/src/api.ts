import {
  BrowserChatApiError,
  type BrowserChatHistoryMessage,
  type BrowserChatSession,
} from "@brains/contracts/browser-chat";
import type { UIMessage } from "ai";
import { createWebChatClient } from "./browser-chat-client";
import { toUiMessages } from "./history-messages";

export type WebChatSession = BrowserChatSession;

export function describeClientFailure(
  error: unknown,
  fallback: string,
): string {
  if (!(error instanceof BrowserChatApiError)) return fallback;
  if (error.status === 401 || error.status === 403) {
    return "Your operator session may have expired. Refresh or sign in again.";
  }
  return error.kind === "invalid-response"
    ? fallback
    : `${fallback} (${error.status})`;
}

export async function fetchWebChatHistory(
  conversationId: string,
): Promise<UIMessage[]> {
  let messages: BrowserChatHistoryMessage[];
  try {
    messages = await createWebChatClient().getMessages(conversationId);
  } catch (error) {
    throw new Error(
      describeClientFailure(error, "Could not reopen that session."),
      { cause: error },
    );
  }
  return toUiMessages(messages);
}

export async function fetchWebChatSessions(): Promise<WebChatSession[]> {
  try {
    return await createWebChatClient().listSessions();
  } catch (error) {
    throw new Error(
      describeClientFailure(error, "Could not load saved sessions."),
      { cause: error },
    );
  }
}
