import type { AuthBackend, WebRouteDefinition } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { LinkedInConnections } from "./lib/linkedin-connection";
import type {
  LinkedInOAuthClient,
  OAuthStateStore,
} from "./lib/linkedin-oauth";

export const START_PATH = "/linkedin/oauth/start";
export const CALLBACK_PATH = "/linkedin/oauth/callback";

export type ConnectionOutcome = "connected" | "declined" | "failed";

type Session = Awaited<ReturnType<AuthBackend["resolveSession"]>>;

export interface OAuthRouteDeps {
  oauth: LinkedInOAuthClient;
  states: OAuthStateStore;
  connections: LinkedInConnections;
  resolveSession(request: Request): Promise<Session>;
  /** Where the callback returns the owner: the LinkedIn workspace. */
  workspaceUrl(): string;
  now(): number;
  logger: Logger;
}

function isAnchor(session: Session): boolean {
  return session?.permissionLevel === "admin" && session.isAnchor;
}

function privateResponse(status: number, location?: string): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(location ? { Location: location } : {}),
    },
  });
}

/**
 * The browser half of direct-mode OAuth. Start sends the Anchor to LinkedIn's
 * consent page; the callback checks the single-use state against the session
 * that started it, exchanges the code server-side, and stores the token in
 * the Anchor's account settings. The token never reaches the browser.
 *
 * Both routes are GET navigations, which carry no Origin header, so start is
 * guarded by the Anchor's session rather than a same-origin check. A forced
 * start only shows the owner their own LinkedIn consent page.
 */
export function createOAuthRoutes(deps: OAuthRouteDeps): WebRouteDefinition[] {
  const backToWorkspace = (outcome: ConnectionOutcome): Response => {
    const url = deps.workspaceUrl();
    const separator = url.includes("?") ? "&" : "?";
    return privateResponse(303, `${url}${separator}connection=${outcome}`);
  };

  const start = async (request: Request): Promise<Response> => {
    const session = await deps.resolveSession(request);
    if (!session) return privateResponse(401);
    if (!isAnchor(session)) return privateResponse(403);
    const state = deps.states.issue(session.userId);
    return privateResponse(302, deps.oauth.authorizationUrl(state).toString());
  };

  const callback = async (request: Request): Promise<Response> => {
    const params = new URL(request.url).searchParams;
    const userId = deps.states.consume(params.get("state") ?? "");
    const session = await deps.resolveSession(request);
    if (!userId || !isAnchor(session) || session?.userId !== userId) {
      return backToWorkspace("failed");
    }
    if (params.has("error")) return backToWorkspace("declined");
    const code = params.get("code");
    if (!code) return backToWorkspace("failed");
    try {
      const token = await deps.oauth.exchange(code, deps.now());
      await deps.connections.save(userId, token);
      return backToWorkspace("connected");
    } catch (error) {
      deps.logger.warn(`LinkedIn connection failed: ${getErrorMessage(error)}`);
      return backToWorkspace("failed");
    }
  };

  return [
    { path: START_PATH, method: "GET", public: true, handler: start },
    { path: CALLBACK_PATH, method: "GET", public: true, handler: callback },
  ];
}
