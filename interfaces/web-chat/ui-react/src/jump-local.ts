/**
 * Chat's local contribution to the cross-surface jump palette: the server
 * endpoint doesn't know this operator's conversations, so the chat app
 * appends them client-side via window.__consoleJumpLocal.
 */

export interface JumpLocalSession {
  id: string;
  title: string;
}

export interface JumpLocalItem {
  id: string;
  title: string;
  href: string;
  tag?: string;
}

export interface JumpLocalGroup {
  id: string;
  label: string;
  items: JumpLocalItem[];
}

declare global {
  interface Window {
    /**
     * Hook read by the console palette script (@brains/console-theme):
     * the hosting surface's local additions to the jump results.
     */
    __consoleJumpLocal?: (query: string) => JumpLocalGroup[];
  }
}

export function buildConversationJumpGroup(
  sessions: JumpLocalSession[],
  query: string,
  chatPath = "/chat",
): JumpLocalGroup | null {
  const q = query.trim().toLowerCase();
  const items = sessions
    .filter((session) => q === "" || session.title.toLowerCase().includes(q))
    .slice(0, 6)
    .map((session) => ({
      id: `session/${session.id}`,
      title: session.title,
      href: `${chatPath}#s/${encodeURIComponent(session.id)}`,
      tag: "chat",
    }));
  return items.length > 0
    ? { id: "conversations", label: "Conversations", items }
    : null;
}

/** Parse a conversation door (#s/{id}) back into a session id. */
export function parseChatSessionHash(hash: string): string | null {
  const match = /^#s\/(.+)$/.exec(hash);
  const raw = match?.[1];
  return raw === undefined ? null : decodeURIComponent(raw);
}
