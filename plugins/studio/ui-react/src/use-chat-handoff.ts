import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { ChatClient } from "@brains/contracts/chat";
import type { StudioChatHandoff } from "./operator-launch";
import { studioChatDraftKey } from "./studio-chat-drafts";
import type { StudioChatDraftStore } from "./studio-chat-drafts";
import { errorMessage } from "./studio-chat-errors";

export interface ChatHandoffInput {
  chatClient: Pick<ChatClient, "openContextSession">;
  handoff: StudioChatHandoff | null | undefined;
  sessionId: string | null | undefined;
  apiPath: string | undefined;
  draftStore: StudioChatDraftStore;
  draftKey: string;
  currentDraftKey: RefObject<string>;
  mountedRef: RefObject<boolean>;
  setDraft: (text: string) => void;
  setError: (value: string | null) => void;
  navigateToSession: (sessionId: string | undefined, replace: boolean) => void;
}

/**
 * Turns an operator handoff into a conversation: seeds the composer with the
 * prompt, opens a context session for the item, and moves the draft over to
 * the conversation the server names.
 *
 * One handoff is acted on once. The source and item make the key, so a rerender
 * with the same handoff object — or a different one — is distinguished by what
 * it points at rather than by identity. A failure clears the key, so the reader
 * can retry; a success leaves it set, because the draft has moved and
 * reopening the same item would seed a second conversation.
 */
export function useChatHandoff(input: ChatHandoffInput): void {
  const {
    chatClient,
    handoff,
    sessionId,
    apiPath,
    draftStore,
    draftKey,
    currentDraftKey,
    mountedRef,
    setDraft,
    setError,
    navigateToSession,
  } = input;
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!handoff || sessionId) return;
    const handoffKey = `${handoff.sourceId}\u0000${handoff.itemId}`;
    if (handledRef.current === handoffKey) return;
    handledRef.current = handoffKey;
    setDraft(handoff.prompt);
    setError(null);
    const stillOurs = (): boolean =>
      mountedRef.current === true &&
      currentDraftKey.current === draftKey &&
      handledRef.current === handoffKey;
    void chatClient
      .openContextSession({
        version: 1,
        sourceId: handoff.sourceId,
        itemId: handoff.itemId,
        titleSeed: handoff.label,
      })
      .then(({ conversationId }) => {
        if (!stillOurs()) return;
        draftStore.adopt(draftKey, studioChatDraftKey(apiPath, conversationId));
        navigateToSession(conversationId, true);
      })
      .catch((cause: unknown) => {
        if (!stillOurs()) return;
        handledRef.current = null;
        setError(errorMessage(cause, "Context could not be attached"));
      });
  }, [
    chatClient,
    handoff,
    sessionId,
    apiPath,
    draftStore,
    draftKey,
    currentDraftKey,
    mountedRef,
    setDraft,
    setError,
    navigateToSession,
  ]);
}
