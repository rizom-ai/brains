const conversationStorageKey = "brain:web-chat:conversation-id";

export function createConversationId(): string {
  return `web-${crypto.randomUUID()}`;
}

/**
 * The conversation this browser was last in, minting a fresh one when there is
 * no usable storage. Private-mode browsers still get a working session; it
 * just does not survive a reload.
 */
export function getBrowserConversationId(): string {
  try {
    const stored = localStorage.getItem(conversationStorageKey);
    if (stored) return stored;
    const next = createConversationId();
    localStorage.setItem(conversationStorageKey, next);
    return next;
  } catch {
    return createConversationId();
  }
}

export function rememberConversationId(conversationId: string): void {
  try {
    localStorage.setItem(conversationStorageKey, conversationId);
  } catch {
    /* localStorage unavailable — the session still works in memory */
  }
}
