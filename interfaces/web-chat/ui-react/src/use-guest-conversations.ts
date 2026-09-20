import { useCallback, useState } from "react";

const locatorKey = "brain-ask-conversation";
const listKey = `${locatorKey}-list`;
const guestLocator = /^guest-[a-f0-9]{64}$/;

/**
 * Read and write this tab's saved conversation list.
 *
 * Storage is best-effort throughout: a visitor with storage disabled must
 * still be able to ask a question. A failure here is never allowed to become a
 * reason to persist anything else — transcripts do not enter browser storage
 * under any circumstance, only locators do.
 */
function savedConversations(add?: string, remove?: string): string[] {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(listKey) ?? "[]");
    const ids = Array.isArray(value)
      ? value.filter(
          (id): id is string =>
            typeof id === "string" && guestLocator.test(id) && id !== remove,
        )
      : [];
    if (add && !ids.includes(add)) ids.push(add);
    sessionStorage.setItem(listKey, JSON.stringify(ids));
    return ids;
  } catch {
    // Conversation locators are optional; transcripts never enter browser storage.
    return add ? [add] : [];
  }
}

function savedLocator(value?: string): string | undefined {
  try {
    if (value !== undefined) {
      if (value) sessionStorage.setItem(locatorKey, value);
      else sessionStorage.removeItem(locatorKey);
    }
    return sessionStorage.getItem(locatorKey) ?? undefined;
  } catch {
    // Storage can be disabled. Never fall back to persisting transcript text.
    return undefined;
  }
}

export interface GuestConversations {
  /** The conversation this tab is currently showing. */
  id: string | undefined;
  /** Every conversation this tab knows about, oldest first. */
  conversations: string[];
  /** Take up what an earlier visit to this tab saved. Returns its locator. */
  adopt: () => string | undefined;
  /** Select a locator, persist it, and add it to this tab's list. */
  remember: (locator: string) => void;
  /** Add a locator to the list without changing the selection. */
  note: (locator: string) => void;
  /** Drop the selection and keep the list — a new conversation, not a delete. */
  clear: () => void;
  /** Drop a locator from the list and the selection, once it is really gone. */
  forget: (locator: string) => void;
  /**
   * Whether this locator is the one persisted for this tab. False when storage
   * is unavailable, which is why continuing is offered only when it is true.
   */
  isSaved: (locator: string) => boolean;
}

export function useGuestConversations(): GuestConversations {
  const [id, setId] = useState<string>();
  const [conversations, setConversations] = useState<string[]>([]);

  const adopt = useCallback((): string | undefined => {
    setConversations(savedConversations());
    const locator = savedLocator();
    if (locator) setId(locator);
    return locator;
  }, []);

  const remember = useCallback((locator: string): void => {
    setId(locator);
    savedLocator(locator);
    setConversations(savedConversations(locator));
  }, []);

  const note = useCallback((locator: string): void => {
    setConversations(savedConversations(locator));
  }, []);

  const clear = useCallback((): void => {
    savedLocator("");
    setId(undefined);
  }, []);

  const forget = useCallback((locator: string): void => {
    savedLocator("");
    setConversations(savedConversations(undefined, locator));
    setId(undefined);
  }, []);

  const isSaved = useCallback(
    (locator: string): boolean => savedLocator() === locator,
    [],
  );

  return {
    id,
    conversations,
    adopt,
    remember,
    note,
    clear,
    forget,
    isSaved,
  };
}
