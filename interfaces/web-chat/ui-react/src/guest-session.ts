import type {
  ChatClient,
  GuestChatSessionResponse,
} from "@brains/contracts/chat";

/** Coordinate normal same-origin tabs, not authority. The browser alone owns
 * the HttpOnly credential. Do not release an acquired lock on unmount: an
 * in-flight issuance can still install a cookie. Only queued waits are aborted. */
export async function openGuestBrowserSession(
  client: ChatClient,
  signal: AbortSignal,
): Promise<GuestChatSessionResponse> {
  const browser: { locks?: LockManager } = navigator;
  if (!browser.locks)
    throw new Error("Browser session coordination unavailable");
  return browser.locks.request("brain-ask-visitor-session", { signal }, () => {
    signal.throwIfAborted();
    return client.openGuestSession();
  });
}
