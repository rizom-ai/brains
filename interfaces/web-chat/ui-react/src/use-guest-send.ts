import { useCallback, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
  ChatApiError,
  CHAT_CONVERSATION_ID_HEADER,
  readChatProtocolEvents,
  getGuestSourceCards,
  type ChatCard,
  type ChatClient,
  type ChatHistoryMessage,
  type ChatMessageRequest,
  type GuestChatSessionResponse,
} from "@brains/contracts/chat";
import type { GuestGate } from "./use-guest-gate";

export interface GuestSendInput {
  client: Pick<ChatClient, "streamMessages" | "getMessages">;
  gate: GuestGate;
  session: GuestChatSessionResponse | undefined;
  canSend: boolean;
  hasElapsed: () => boolean;
  markExpired: () => void;
  conversationId: string | undefined;
  remember: (locator: string) => void;
  setMessages: Dispatch<SetStateAction<ChatHistoryMessage[]>>;
  showHistory: (history: ChatHistoryMessage[]) => void;
  draft: string;
  setDraft: (text: string) => void;
  /** Called once a submission is accepted, before the request goes out. */
  onStart: () => void;
  /** Shared with the session reopen, so one Stop can abort either. */
  controller: RefObject<AbortController | undefined>;
}

export interface GuestSend {
  /**
   * The submission this tab is still unsure about. Its presence blocks a new
   * question; an `id` on it means a retry can check the same submission.
   */
  pending: ChatMessageRequest | undefined;
  setPending: Dispatch<SetStateAction<ChatMessageRequest | undefined>>;
  send: (retry?: ChatMessageRequest) => Promise<void>;
  stopWaiting: () => void;
}

/**
 * Asking a question, and everything that can be true afterwards.
 *
 * The rules this encodes are about what may be sent twice, and they are the
 * reason the function is careful rather than short:
 *
 * - A submission that came back with no conversation locator is *uncertain*.
 *   This tab cannot tell whether the brain ran it, so it is never retried and
 *   never confirmed — only preserved on screen.
 * - A receipt means the brain already has the request. The answer is restored
 *   from history; the question is not asked again.
 * - A retry checks the same submission. Replaying a submission whose id the
 *   server never acknowledged could create a turn for another visitor, since
 *   the guest cookie may have changed, so a retry without an id is refused.
 */
export function useGuestSend(input: GuestSendInput): GuestSend {
  const {
    client,
    gate,
    session,
    canSend,
    hasElapsed,
    markExpired,
    conversationId,
    remember,
    setMessages,
    showHistory,
    draft,
    setDraft,
    onStart,
    controller,
  } = input;
  const [pending, setPending] = useState<ChatMessageRequest>();
  const { setBoxState, setBoxNotice, setStatus } = gate;

  const send = useCallback(
    async (retry?: ChatMessageRequest): Promise<void> => {
      if (gate.locked() || !canSend || !session) return;
      // The cookie may have changed since an ambiguous first send. Without a
      // server locator, replaying its ID could create a turn for another visitor.
      if (retry && !retry.id) return;
      if (hasElapsed()) {
        markExpired();
        setBoxState("expired");
        setStatus(
          "Your visitor session has expired. Reload to begin a new session.",
        );
        return;
      }
      const text = draft.trim();
      if (!retry && (!text || draft.length > session.messageCharacters)) return;
      const submission = retry ?? {
        ...(conversationId ? { id: conversationId } : {}),
        messages: [
          {
            id: crypto.randomUUID(),
            role: "user" as const,
            parts: [{ type: "text", text }],
          },
        ],
      };
      await gate.run(async (): Promise<void> => {
        setBoxState("sending");
        setBoxNotice(undefined);
        onStart();
        setPending(submission);
        setStatus("Thinking with public knowledge…");
        if (!retry) {
          setMessages((previous) => [
            ...previous,
            {
              id: submission.messages[0]?.id ?? crypto.randomUUID(),
              role: "user",
              content: text,
            },
          ]);
          setDraft("");
        }
        const abort = new AbortController();
        controller.current = abort;
        const answerId = crypto.randomUUID();
        let finished = false;
        let locatorReceived = false;
        let responseText = "";
        let responseCards: ChatCard[] = [];
        try {
          const response = await client.streamMessages(submission, {
            signal: abort.signal,
          });
          abort.signal.throwIfAborted();
          const locator = response.headers.get(CHAT_CONVERSATION_ID_HEADER);
          if (!locator) throw new Error("Missing conversation locator");
          remember(locator);
          locatorReceived = true;
          setBoxState("working");
          setPending({ ...submission, id: locator });
          for await (const event of readChatProtocolEvents(response)) {
            if (abort.signal.aborted) throw new Error("Stopped waiting");
            if (event.type === "error" || event.type === "abort")
              throw new Error("Response unavailable");
            if (event.type === "text-delta") responseText += event.delta;
            if (event.type === "data-sources")
              responseCards = getGuestSourceCards([
                ...responseCards,
                event.data,
              ]);
            if (event.type === "text-delta" || event.type === "data-sources") {
              setMessages((previous) => [
                ...previous.filter((message) => message.id !== answerId),
                {
                  id: answerId,
                  role: "assistant",
                  content: responseText,
                  cards: responseCards,
                },
              ]);
            }
            if (event.type === "finish")
              finished = event.finishReason === "stop";
          }
          if (!finished || !responseText.trim())
            throw new Error("Incomplete response");
          setPending(undefined);
          setBoxState("complete");
          setStatus(
            "Answer received. Check important claims against the original sources.",
          );
        } catch (error) {
          if (error instanceof ChatApiError && error.guestSubmission) {
            const receipt = error.guestSubmission;
            setBoxState("incomplete");
            remember(receipt.conversationId);
            setPending({ ...submission, id: receipt.conversationId });
            setStatus(
              receipt.state === "completed"
                ? "This request already completed. Restoring history…"
                : "This request was already received. It will not be sent again automatically.",
            );
            try {
              const history = await client.getMessages(receipt.conversationId);
              if (receipt.state === "completed") {
                showHistory(history);
                setPending(undefined);
                setBoxState("complete");
                setStatus("Conversation restored.");
              }
              if (
                receipt.state === "failed" ||
                receipt.state === "interrupted"
              ) {
                setPending(undefined);
                setBoxState("ended");
                setStatus(
                  "The previous request ended without a complete answer. You may submit a new question.",
                );
              }
            } catch {
              // Preserve the visible question/partial reply when history cannot load.
              setStatus(
                "The request was received, but its conversation is unavailable or expired.",
              );
            }
          } else if (error instanceof ChatApiError && error.status === 429) {
            setBoxState("limit");
            setStatus(
              "A guest limit has been reached, or another request is still running. Nothing will be retried automatically.",
            );
          } else if (!submission.id && !locatorReceived) {
            setBoxState("uncertain");
            setStatus(
              "No conversation locator was received. This tab cannot safely retry or confirm whether the request ran. Your visible question is preserved; nothing will be resent automatically.",
            );
          } else {
            setBoxState("incomplete");
            setStatus(
              abort.signal.aborted
                ? "Stopped waiting. Remote work may still be running; this is not a cancellation guarantee."
                : "The answer is unavailable or incomplete. Your visible text is preserved. Retry checks the same submission, not a new question.",
            );
          }
        } finally {
          controller.current = undefined;
        }
      });
    },
    [
      client,
      gate,
      session,
      canSend,
      hasElapsed,
      markExpired,
      conversationId,
      remember,
      setMessages,
      showHistory,
      draft,
      setDraft,
      onStart,
      controller,
      setBoxState,
      setBoxNotice,
      setStatus,
    ],
  );

  const stopWaiting = useCallback((): void => {
    controller.current?.abort();
  }, [controller]);

  return { pending, setPending, send, stopWaiting };
}
