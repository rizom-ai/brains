import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ChatCard,
  ChatClient,
  ChatHistoryMessage,
} from "@brains/contracts/chat";
import {
  streamAssistantMessage,
  type StudioChatStreamState,
} from "./chat-workspace-model";
import { studioChatKeys } from "./studio-chat-contracts";

export interface ChatThreadInput {
  chatClient: Pick<ChatClient, "getMessages">;
  sessionId: string | null | undefined;
  sending: boolean;
  /** The optimistic copy of a turn the server has not confirmed yet. */
  pendingMessages: ChatHistoryMessage[];
  stream: StudioChatStreamState | null;
}

export interface ChatThread {
  /** Stored history, the optimistic copy, and the live stream, in order. */
  visibleMessages: ChatHistoryMessage[];
  /** The cards the context panel shows beside the thread. */
  contextCards: ChatCard[];
  /** The stored history could not be read. */
  historyFailed: boolean;
  /** Waiting on the first read of the stored history. */
  historyOpening: boolean;
  /** A read is in flight, so a retry would be a second one. */
  historyReading: boolean;
  /** Some history did arrive, so a later failure is not a blank thread. */
  hasStoredHistory: boolean;
  retryHistory: () => void;
}

/**
 * Assembles what the thread shows out of the three things that can say it:
 * the stored history, the optimistic copy of a turn in flight, and the stream
 * producing the answer right now.
 *
 * History is not fetched while an optimistic copy stands. A newly accepted
 * session already has a copy of its first turn, and refetching mid-stream
 * would show the reader a thread that briefly lost the message they just sent.
 */
export function useChatThread(input: ChatThreadInput): ChatThread {
  const { chatClient, sessionId, sending, pendingMessages, stream } = input;

  const messagesQuery = useQuery({
    queryKey: studioChatKeys.messages(sessionId ?? ""),
    queryFn: () => chatClient.getMessages(sessionId ?? ""),
    enabled:
      sessionId !== null &&
      sessionId !== undefined &&
      !sending &&
      pendingMessages.length === 0,
  });
  const storedMessages = messagesQuery.data ?? [];

  const visibleMessages = useMemo(() => {
    const next = [...storedMessages, ...pendingMessages];
    if (stream && (stream.text || stream.cards.length > 0)) {
      next.push(streamAssistantMessage(stream));
    }
    return next;
  }, [pendingMessages, storedMessages, stream]);

  const contextCards = useMemo(
    () =>
      visibleMessages.flatMap((message) =>
        (message.cards ?? []).filter(
          (card) => card.kind === "sources" || card.kind === "attachment",
        ),
      ),
    [visibleMessages],
  );

  return {
    visibleMessages,
    contextCards,
    historyFailed: messagesQuery.error !== null,
    historyOpening: messagesQuery.isPending,
    historyReading: messagesQuery.isFetching,
    hasStoredHistory: storedMessages.length > 0,
    retryHistory: (): void => void messagesQuery.refetch(),
  };
}
