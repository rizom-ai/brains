/**
 * Chat-only. The draft store itself is held by the Studio container, so it
 * ships in the entry bundle; the Chat API path must not travel with it. Keeping
 * this key here leaves the path in the lazily loaded Chat chunk, where the
 * split-asset contract expects it.
 */
export function studioChatDraftKey(
  apiPath: string | undefined,
  sessionId: string | null,
): string {
  return JSON.stringify([apiPath ?? "/api/chat", sessionId]);
}
