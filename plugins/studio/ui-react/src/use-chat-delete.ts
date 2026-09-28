import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { ChatClient, ChatSession } from "@brains/contracts/chat";
import { studioChatKeys } from "./studio-chat-contracts";

interface ChatDeleteInput {
  chatClient: Pick<ChatClient, "deleteSession">;
  queryClient: QueryClient;
  sessionId: string | null;
  draftKey: string;
  currentDraftKey: RefObject<string>;
  mountedRef: RefObject<boolean>;
  blocked: boolean;
  setSending: (value: boolean) => void;
  navigateToSession: (sessionId: string | undefined, replace: boolean) => void;
}

export interface ChatDelete {
  confirming: boolean;
  deleting: boolean;
  deleteError: string | null;
  requestDelete: () => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
  reset: () => void;
}

/** Deletion is deliberate, scoped to the open session, and never retried automatically. */
export function useChatDelete(input: ChatDeleteInput): ChatDelete {
  const {
    chatClient,
    queryClient,
    sessionId,
    draftKey,
    currentDraftKey,
    mountedRef,
    blocked,
    setSending,
    navigateToSession,
  } = input;
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const confirming = confirmation === draftKey;

  const reset = useCallback((): void => {
    generation.current++;
    inFlight.current = false;
    setConfirmation(null);
    setDeleting(false);
    setDeleteError(null);
  }, []);

  const requestDelete = (): void => {
    if (!sessionId || blocked || inFlight.current) return;
    setDeleteError(null);
    setConfirmation(draftKey);
  };
  const cancelDelete = (): void => {
    if (!inFlight.current) setConfirmation(null);
  };
  const confirmDelete = async (): Promise<void> => {
    if (!sessionId || !confirming || blocked || inFlight.current) return;
    const requestGeneration = generation.current;
    const stillCurrent = (): boolean =>
      mountedRef.current &&
      currentDraftKey.current === draftKey &&
      generation.current === requestGeneration;
    inFlight.current = true;
    setDeleting(true);
    setSending(true);
    setDeleteError(null);
    try {
      const result = await chatClient.deleteSession(sessionId);
      if (!result.deleted) throw new Error("Deletion was not acknowledged");
      await queryClient.cancelQueries({
        queryKey: studioChatKeys.messages(sessionId),
      });
      queryClient.removeQueries({
        queryKey: studioChatKeys.messages(sessionId),
      });
      queryClient.setQueriesData<ChatSession[]>(
        { queryKey: studioChatKeys.sessions },
        (sessions) => sessions?.filter((session) => session.id !== sessionId),
      );
      void queryClient.invalidateQueries({ queryKey: studioChatKeys.sessions });
      if (stillCurrent()) {
        setConfirmation(null);
        navigateToSession(undefined, true);
      }
    } catch {
      // A failed request or local reconciliation cannot confirm the visible
      // outcome. Keep that uncertainty explicit without exposing server
      // diagnostics or automatically repeating a destructive operation.
      if (stillCurrent())
        setDeleteError(
          "Deletion could not be confirmed. The conversation may already be deleted. Check history before trying again.",
        );
    } finally {
      if (stillCurrent()) {
        inFlight.current = false;
        setDeleting(false);
        setSending(false);
      }
    }
  };
  return {
    confirming,
    deleting,
    deleteError,
    requestDelete,
    cancelDelete,
    confirmDelete,
    reset,
  };
}
