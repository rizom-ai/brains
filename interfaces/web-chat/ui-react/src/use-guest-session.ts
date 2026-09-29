import { useCallback, useState } from "react";
import type { GuestChatSessionResponse } from "@brains/contracts/chat";

export interface GuestSessionInput {
  /** Opens a visitor session against the brain, honouring the signal. */
  open: (signal: AbortSignal) => Promise<GuestChatSessionResponse>;
}

export interface GuestSession {
  session: GuestChatSessionResponse | undefined;
  /** The visitor's allowance has run out and this tab has recorded it. */
  expired: boolean;
  /** The brain allows a question and nothing has since withdrawn that. */
  canSend: boolean;
  open: (signal: AbortSignal) => Promise<GuestChatSessionResponse>;
  /**
   * Whether the allowance has run out by the clock. Separate from `expired`,
   * which is this tab having acted on it: a visitor is told once, on their
   * next attempt, rather than having the page change under them.
   */
  hasElapsed: () => boolean;
  markExpired: () => void;
  clearExpired: () => void;
}

/**
 * The visitor's session with the brain: whether one is open, what it permits,
 * and whether its allowance has run out.
 *
 * Opening is deliberately not caught here. Its failures mean different things
 * to different callers — at mount the page reports that guest access is
 * unavailable, while a later retry from the box keeps the visitor's draft and
 * says nothing was sent — so the caller decides.
 */
export function useGuestSession(input: GuestSessionInput): GuestSession {
  const { open: openSession } = input;
  const [session, setSession] = useState<GuestChatSessionResponse>();
  const [expired, setExpired] = useState(false);

  const open = useCallback(
    async (signal: AbortSignal): Promise<GuestChatSessionResponse> => {
      const opened = await openSession(signal);
      setSession(opened);
      return opened;
    },
    [openSession],
  );

  const hasElapsed = useCallback(
    (): boolean => session !== undefined && Date.now() >= session.expiresAt,
    [session],
  );

  const markExpired = useCallback((): void => setExpired(true), []);
  const clearExpired = useCallback((): void => setExpired(false), []);

  return {
    session,
    expired,
    canSend: !!session?.canSend && !expired,
    open,
    hasElapsed,
    markExpired,
    clearExpired,
  };
}
