import { oauthBrokerReturnSchema } from "@brains/contracts";
import type { AuthBackend, WebRouteDefinition } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import type { SingleUseStore } from "@brains/utils/single-use-store";
import type { LinkedInBrokerClient } from "./lib/linkedin-broker";
import type { LinkedInConnections } from "./lib/linkedin-connection";
import type { LinkedInOAuthClient, LinkedInToken } from "./lib/linkedin-oauth";

export const START_PATH = "/linkedin/oauth/start";
export const CALLBACK_PATH = "/linkedin/oauth/callback";
export const BROKER_RETURN_PATH = "/linkedin/oauth/broker/return";

export type ConnectionOutcome = "connected" | "declined" | "failed";

type Session = Awaited<ReturnType<AuthBackend["resolveSession"]>>;

/** Direct: the instance's own LinkedIn app. Broker: the central broker's. */
export type ConsentMode =
  | { kind: "direct"; oauth: LinkedInOAuthClient }
  | { kind: "broker"; broker: LinkedInBrokerClient };

export interface OAuthRouteDeps {
  mode: ConsentMode;
  states: SingleUseStore<string>;
  connections: LinkedInConnections;
  resolveSession(request: Request): Promise<Session>;
  /** Where the owner returns after consent: the LinkedIn workspace. */
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
 * The browser half of the LinkedIn connection. Start sends the Anchor to
 * LinkedIn's consent page, directly or through the broker. The return route
 * accepts the single-use state only from the session that started it, gets
 * the token server-side (code exchange or grant redemption), and stores it in
 * the Anchor's account settings. The token never reaches the browser.
 *
 * Both are GET navigations, which carry no Origin header, so start is guarded
 * by the Anchor's session rather than a same-origin check. A forced start
 * only shows the owner their own LinkedIn consent page.
 */
export function createOAuthRoutes(deps: OAuthRouteDeps): WebRouteDefinition[] {
  const backToWorkspace = (outcome: ConnectionOutcome): Response => {
    const url = deps.workspaceUrl();
    const separator = url.includes("?") ? "&" : "?";
    return privateResponse(303, `${url}${separator}connection=${outcome}`);
  };

  /** The account the state belongs to, when the same Anchor brings it back. */
  const returningAnchor = async (
    request: Request,
    state: string,
  ): Promise<string | null> => {
    const userId = deps.states.take(state);
    const session = await deps.resolveSession(request);
    return userId && isAnchor(session) && session?.userId === userId
      ? userId
      : null;
  };

  const connect = async (
    userId: string,
    token: () => Promise<LinkedInToken>,
  ): Promise<Response> => {
    try {
      await deps.connections.save(userId, await token());
      return backToWorkspace("connected");
    } catch (error) {
      deps.logger.warn(`LinkedIn connection failed: ${getErrorMessage(error)}`);
      return backToWorkspace("failed");
    }
  };

  const start = async (request: Request): Promise<Response> => {
    const session = await deps.resolveSession(request);
    if (!session) return privateResponse(401);
    if (!isAnchor(session)) return privateResponse(403);
    const state = deps.states.issue(session.userId);
    const { mode } = deps;
    if (mode.kind === "direct") {
      return privateResponse(
        302,
        mode.oauth.authorizationUrl(state).toString(),
      );
    }
    try {
      return privateResponse(
        302,
        (await mode.broker.authorize(state)).toString(),
      );
    } catch (error) {
      deps.logger.warn(
        `LinkedIn broker connection failed: ${getErrorMessage(error)}`,
      );
      return backToWorkspace("failed");
    }
  };

  const callback =
    (oauth: LinkedInOAuthClient) =>
    async (request: Request): Promise<Response> => {
      const params = new URL(request.url).searchParams;
      const userId = await returningAnchor(request, params.get("state") ?? "");
      if (!userId) return backToWorkspace("failed");
      if (params.has("error")) return backToWorkspace("declined");
      const code = params.get("code");
      if (!code) return backToWorkspace("failed");
      return connect(userId, () => oauth.exchange(code, deps.now()));
    };

  const brokerReturn =
    (broker: LinkedInBrokerClient) =>
    async (request: Request): Promise<Response> => {
      const params = new URL(request.url).searchParams;
      const userId = await returningAnchor(request, params.get("state") ?? "");
      const returned = oauthBrokerReturnSchema.safeParse(
        Object.fromEntries(params),
      );
      if (!userId || !returned.success) return backToWorkspace("failed");
      if ("error" in returned.data) {
        return backToWorkspace(
          returned.data.error === "provider_denied" ? "declined" : "failed",
        );
      }
      const { grant } = returned.data;
      return connect(userId, () => broker.redeem(grant));
    };

  const { mode } = deps;
  return [
    { path: START_PATH, method: "GET", public: true, handler: start },
    mode.kind === "direct"
      ? {
          path: CALLBACK_PATH,
          method: "GET",
          public: true,
          handler: callback(mode.oauth),
        }
      : {
          path: BROKER_RETURN_PATH,
          method: "GET",
          public: true,
          handler: brokerReturn(mode.broker),
        },
  ];
}
