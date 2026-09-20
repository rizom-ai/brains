import { useCallback } from "react";
import type { RefObject } from "react";
import type {
  ChatClient,
  ChatHistoryMessage,
  ChatMessageRequest,
} from "@brains/contracts/chat";
import type { GuestGate } from "./use-guest-gate";

export interface GuestHistoryCheckInput {
  client: Pick<ChatClient, "getGuestHistory" | "getMessages">;
  gate: GuestGate;
  conversationId: string | undefined;
  /** The submission being checked; its first message id is the receipt key. */
  pending: ChatMessageRequest | undefined;
  clearPending: () => void;
  showHistory: (history: ChatHistoryMessage[]) => void;
  restoredQuestion: RefObject<string | undefined>;
}

export interface GuestHistoryCheck {
  check: () => Promise<void>;
}

/**
 * Asks whether a request that this tab lost track of actually produced an
 * answer — without sending anything.
 *
 * What counts as confirmation is the whole point. A history that merely looks
 * right proves nothing: the same visitor may have the conversation open in
 * another tab, so message count and text can match a submission that was never
 * this one. Only two things confirm it — an exact receipt from the brain, or a
 * question id this tab restored earlier, which the server assigned and which is
 * therefore stable, followed by an answer.
 *
 * Anything else is inconclusive and says so. A failed check in particular is
 * never read as permission to send again.
 */
export function useGuestHistoryCheck(
  input: GuestHistoryCheckInput,
): GuestHistoryCheck {
  const {
    client,
    gate,
    conversationId,
    pending,
    clearPending,
    showHistory,
    restoredQuestion,
  } = input;
  const { setBoxState, setBoxNotice, mounted } = gate;

  const check = useCallback(async (): Promise<void> => {
    if (!conversationId) return;
    setBoxNotice(undefined);
    await gate.run(
      async (): Promise<void> => {
        const submissionId = pending?.messages[0]?.id;
        const checked = submissionId
          ? await client.getGuestHistory(conversationId, submissionId)
          : undefined;
        const history =
          checked?.messages ?? (await client.getMessages(conversationId));
        if (!mounted.current) return;
        // Count/text matching cannot identify a submission across tabs. Only an
        // exact receipt, or a stable restored server message ID, can confirm it.
        const restoredIndex = history.findIndex(
          (message) =>
            message.id === restoredQuestion.current && message.role === "user",
        );
        const completed = checked
          ? checked.submission?.conversationId === conversationId &&
            checked.submission.state === "completed"
          : restoredIndex >= 0 &&
            history[restoredIndex + 1]?.role === "assistant";
        if (
          completed &&
          history.some(
            (message) => message.role === "assistant" && message.content.trim(),
          )
        ) {
          showHistory(history);
          clearPending();
          if (history.at(-1)?.role === "user") {
            restoredQuestion.current = history.at(-1)?.id;
            setBoxState("incomplete");
          } else setBoxState("complete");
        } else if (
          checked?.submission?.conversationId === conversationId &&
          ["failed", "interrupted"].includes(checked.submission.state)
        ) {
          clearPending();
          setBoxState("ended");
        } else {
          setBoxNotice(
            completed
              ? "The request completed, but its answer is not available in history. Your visible text is preserved."
              : "No complete answer is confirmed yet. Your question has not been sent again.",
          );
        }
      },
      (): void => {
        // Treat failed/cancelled history checks as inconclusive, never as proof
        // that replay is safe. Preserve visible text and hide raw transport errors.
        if (mounted.current)
          setBoxNotice(
            "We couldn’t check the answer. Your visible text is unchanged; nothing was sent again.",
          );
      },
    );
  }, [
    client,
    gate,
    conversationId,
    pending,
    clearPending,
    showHistory,
    restoredQuestion,
    setBoxState,
    setBoxNotice,
    mounted,
  ]);

  return { check };
}
