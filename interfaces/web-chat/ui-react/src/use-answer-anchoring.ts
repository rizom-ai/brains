import { useLayoutEffect, useRef } from "react";
import type { FollowTail } from "@brains/app-ui-react";
import type { ChatHistoryMessage } from "@brains/contracts/chat";

/**
 * An answer opens at its question, so it is read from the start; the reader
 * follows the end again from "Latest". A box its page grows has no region
 * to scroll and is left to the page.
 */
export function useAnswerAnchoring(
  tail: Pick<FollowTail, "ref" | "showFrom">,
  messages: ChatHistoryMessage[],
): void {
  const lastRole = useRef(messages.at(-1)?.role);
  useLayoutEffect(() => {
    const previous = lastRole.current;
    lastRole.current = messages.at(-1)?.role;
    if (previous !== "user" || messages.at(-1)?.role !== "assistant") return;
    const region = tail.ref.current;
    if (!region || region.scrollHeight <= region.clientHeight) return;
    const asked = [...region.querySelectorAll<HTMLElement>(".guest-user")].at(
      -1,
    );
    if (asked) tail.showFrom(asked);
  }, [messages]);
}
