import { useCallback, useState } from "react";
import type { RefObject } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { ChatClient } from "@brains/contracts/chat";
import { studioChatKeys } from "./studio-chat-contracts";
import { errorMessage } from "./studio-chat-errors";

export interface ChatArchiveInput {
  chatClient: Pick<ChatClient, "archiveSession">;
  queryClient: QueryClient;
  sessionId: string | null | undefined;
  draftKey: string;
  /** Archiving reports back only while the same conversation is still open. */
  currentDraftKey: RefObject<string>;
  mountedRef: RefObject<boolean>;
  /** Unsent work — a draft, uploads, a turn in flight — holds the archive. */
  blocked: boolean;
  setSending: (value: boolean) => void;
  setError: (value: string | null) => void;
  navigateToSession: (sessionId: string | undefined, replace: boolean) => void;
}

export interface ChatArchive {
  archiving: boolean;
  archiveCurrent: () => Promise<void>;
  /** Forget an archive in flight; the conversation it belonged to is gone. */
  reset: () => void;
}

/**
 * Archives the open conversation and leaves for a new one.
 *
 * It takes the composer with it — `setSending` while it runs — because a
 * conversation that is going away must not accept another turn on the way out.
 */
export function useChatArchive(input: ChatArchiveInput): ChatArchive {
  const {
    chatClient,
    queryClient,
    sessionId,
    draftKey,
    currentDraftKey,
    mountedRef,
    blocked,
    setSending,
    setError,
    navigateToSession,
  } = input;
  const [archiving, setArchiving] = useState(false);

  const archiveCurrent = useCallback(async (): Promise<void> => {
    if (!sessionId || blocked) return;
    setSending(true);
    setArchiving(true);
    try {
      await chatClient.archiveSession(sessionId);
      await queryClient.invalidateQueries({
        queryKey: studioChatKeys.sessions,
      });
      if (mountedRef.current && currentDraftKey.current === draftKey)
        navigateToSession(undefined, true);
    } catch (cause) {
      if (mountedRef.current && currentDraftKey.current === draftKey)
        setError(errorMessage(cause, "Conversation could not be archived"));
    } finally {
      if (mountedRef.current && currentDraftKey.current === draftKey) {
        setSending(false);
        setArchiving(false);
      }
    }
  }, [
    chatClient,
    queryClient,
    sessionId,
    draftKey,
    currentDraftKey,
    mountedRef,
    blocked,
    setSending,
    setError,
    navigateToSession,
  ]);

  const reset = useCallback((): void => setArchiving(false), []);

  return { archiving, archiveCurrent, reset };
}
