/**
 * Well-known web routes. A route claims a role so other plugins find it by
 * what it is, never by guessing another plugin's id and path.
 */
export const WEB_ROUTE_ROLES = [
  /** The dashboard page. */
  "dashboard",
  /** Studio's own page. */
  "studio",
  /** Studio's native chat, when the brain runs a chat backend. */
  "studio-chat",
  /** Studio's workspace pages, matched by prefix. */
  "studio-workspaces",
  /** The public Ask page. */
  "ask",
  /** The chat backend's message endpoint; its session and action routes live under it. */
  "chat-api",
] as const;

export type WebRouteRole = (typeof WEB_ROUTE_ROLES)[number];
