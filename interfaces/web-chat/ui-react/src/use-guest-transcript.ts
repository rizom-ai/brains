import { useCallback, useRef, useState } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { ChatHistoryMessage } from "@brains/contracts/chat";

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
}

/** What the visitor can see. Where the view is looking belongs to the page. */
export function useGuestTranscript(): GuestTranscript {
  const [messages, setMessages] = useState<ChatHistoryMessage[]>([]);
  const [earlier, setEarlier] = useState<ChatHistoryMessage[]>([]);
  const restoredQuestion = useRef<string | undefined>(undefined);

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
  };
}
