import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ChatHistoryMessage } from "@brains/contracts/chat";

/** Within this many pixels of the bottom counts as reading the newest message. */
const followThresholdPx = 64;

export interface GuestTranscriptInput {
  /** The boxed embed scrolls itself; the page does not. */
  box: boolean;
}

export interface GuestTranscript {
  messages: ChatHistoryMessage[];
  /** Turns set aside by starting a new conversation, still shown in the box. */
  earlier: ChatHistoryMessage[];
  setMessages: Dispatch<SetStateAction<ChatHistoryMessage[]>>;
  /** Show a conversation's history in place of what is on screen. */
  show: (history: ChatHistoryMessage[]) => void;
  /** Set the visible turns aside and start empty, deleting nothing. */
  setAside: () => void;
  /** Forget everything on screen, after the conversation is really gone. */
  clear: () => void;
  /**
   * The last question this tab restored rather than sent. Only an id the
   * server gave back can confirm a submission, so this is how a restored
   * question is recognised later.
   */
  restoredQuestion: RefObject<string | undefined>;
  transcriptRef: RefObject<HTMLDivElement | null>;
  /** Whether the view should stay pinned to the newest message. */
  followTranscript: RefObject<boolean>;
}

/**
 * What the visitor can see, and where the view is looking.
 *
 * Following the newest message is a ref rather than state on purpose: it is
 * written from a scroll handler on every frame of a drag, and re-rendering the
 * transcript for that would fight the scrolling it is trying to observe.
 */
export function useGuestTranscript(
  input: GuestTranscriptInput,
): GuestTranscript {
  const { box } = input;
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [earlier, setEarlier] = useState<ChatHistoryMessage[]>([]);
  const restoredQuestion = useRef<string | undefined>(undefined);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const followTranscript = useRef(true);

  useEffect(() => {
    if (box || !transcriptRef.current) return;
    // An emptied transcript starts following again; the reader has not chosen
    // to look away from a conversation that no longer exists.
    if (!messages.length) followTranscript.current = true;
    if (followTranscript.current)
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [box, messages]);

  const show = useCallback((history: ChatHistoryMessage[]): void => {
    setMessages(history);
  }, []);

  const setAside = useCallback((): void => {
    setEarlier((previous) => [...previous, ...messages]);
    setMessages([]);
    restoredQuestion.current = undefined;
  }, [messages]);

  const clear = useCallback((): void => {
    setMessages([]);
  }, []);

  return {
    messages,
    earlier,
    setMessages,
    show,
    setAside,
    clear,
    restoredQuestion,
    transcriptRef,
    followTranscript,
  };
}

export { followThresholdPx };
