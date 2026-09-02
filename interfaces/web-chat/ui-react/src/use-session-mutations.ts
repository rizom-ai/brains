import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WebChatSession } from "./api";
import type { SessionDialogState } from "./components/session-dialog";
import {
  archiveWebChatSession,
  deleteWebChatSession,
  removeWebChatSessionCaches,
  renameWebChatSession,
  renameWebChatSessionCache,
  type RenameWebChatSessionInput,
  type WebChatSessionMutationInput,
} from "./mutations";
import { useWebChatClient } from "./web-chat-fetch";

export interface SessionMutationsOptions {
  chatIsBusy: boolean;
  activeConversationId: string;
  /** Called when the mutated session was the open one and can no longer be shown. */
  onActiveSessionRemoved: () => void;
  setError: (message: string | null) => void;
  /** Called after any mutation settles successfully — restores prompt focus. */
  onSettled: () => void;
}

export interface SessionMutations {
  dialog: SessionDialogState;
  renameDraft: string;
  renamingConversationId: string | null;
  archivingConversationId: string | null;
  deletingConversationId: string | null;
  setRenameDraft: (title: string) => void;
  openRenameDialog: (session: WebChatSession) => void;
  openArchiveDialog: (session: WebChatSession) => void;
  openDeleteDialog: (session: WebChatSession) => void;
  closeDialog: () => void;
  renameConversation: (session: WebChatSession, nextTitle: string) => void;
  archiveConversation: (session: WebChatSession) => void;
  deleteConversation: (session: WebChatSession) => void;
}

/**
 * Rename/archive/delete for the session rail, plus the confirmation dialog
 * they share. Each mutation reconciles the query cache itself rather than
 * refetching, so the rail does not flicker mid-conversation.
 */
export function useSessionMutations(
  options: SessionMutationsOptions,
): SessionMutations {
  const queryClient = useQueryClient();
  const chatClient = useWebChatClient();
  const [dialog, setDialog] = useState<SessionDialogState>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const renameSessionMutation = useMutation({
    mutationFn: (input: RenameWebChatSessionInput): Promise<void> =>
      renameWebChatSession(input, chatClient),
  });
  const archiveSessionMutation = useMutation({
    mutationFn: (input: WebChatSessionMutationInput): Promise<void> =>
      archiveWebChatSession(input, chatClient),
  });
  const deleteSessionMutation = useMutation({
    mutationFn: (input: WebChatSessionMutationInput): Promise<void> =>
      deleteWebChatSession(input, chatClient),
  });

  function closeDialog(): void {
    setDialog(null);
    setRenameDraft("");
  }

  function onRemoved(session: WebChatSession): void {
    removeWebChatSessionCaches(queryClient, session.id);
    if (session.id === options.activeConversationId) {
      options.onActiveSessionRemoved();
    }
    closeDialog();
    options.onSettled();
  }

  return {
    dialog,
    renameDraft,
    renamingConversationId: renameSessionMutation.isPending
      ? renameSessionMutation.variables.conversationId
      : null,
    archivingConversationId: archiveSessionMutation.isPending
      ? archiveSessionMutation.variables.conversationId
      : null,
    deletingConversationId: deleteSessionMutation.isPending
      ? deleteSessionMutation.variables.conversationId
      : null,
    setRenameDraft,
    openRenameDialog: (session): void => {
      setRenameDraft(session.title);
      setDialog({ kind: "rename", session });
    },
    openArchiveDialog: (session): void => {
      setDialog({ kind: "archive", session });
    },
    openDeleteDialog: (session): void => {
      setDialog({ kind: "delete", session });
    },
    closeDialog,
    renameConversation: (session, nextTitle): void => {
      const trimmedTitle = nextTitle.trim();
      if (
        options.chatIsBusy ||
        renameSessionMutation.isPending ||
        !trimmedTitle ||
        trimmedTitle === session.title
      ) {
        closeDialog();
        return;
      }

      options.setError(null);
      renameSessionMutation.mutate(
        { conversationId: session.id, title: trimmedTitle },
        {
          onSuccess: () => {
            renameWebChatSessionCache(queryClient, {
              conversationId: session.id,
              title: trimmedTitle,
            });
            closeDialog();
            options.onSettled();
          },
          onError: (error) => options.setError(error.message),
        },
      );
    },
    archiveConversation: (session): void => {
      if (options.chatIsBusy || archiveSessionMutation.isPending) return;

      options.setError(null);
      archiveSessionMutation.mutate(
        { conversationId: session.id },
        {
          onSuccess: () => onRemoved(session),
          onError: (error) => options.setError(error.message),
        },
      );
    },
    deleteConversation: (session): void => {
      if (options.chatIsBusy || deleteSessionMutation.isPending) return;

      options.setError(null);
      deleteSessionMutation.mutate(
        { conversationId: session.id },
        {
          onSuccess: () => onRemoved(session),
          onError: (error) => options.setError(error.message),
        },
      );
    },
  };
}
