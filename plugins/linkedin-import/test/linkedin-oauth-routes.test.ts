import { describe, expect, it } from "bun:test";
import {
  LINKEDIN_PORTABILITY_SCOPE,
  LinkedInOAuthClient,
  type LinkedInOAuthConnectionStatus,
  type LinkedInOAuthToken,
  type LinkedInOAuthTokenStore,
} from "../src/lib/linkedin-oauth-client";
import {
  createLinkedInOAuthRoutes,
  LINKEDIN_ADMIN_CONNECT_PATH,
  LINKEDIN_ADMIN_DISCONNECT_PATH,
  LINKEDIN_ADMIN_MUTATION_ACTIONS,
  LINKEDIN_ADMIN_STATUS_PATH,
  LINKEDIN_DIRECT_CALLBACK_PATH,
} from "../src/lib/linkedin-oauth-routes";
import { LinkedInOAuthStateStore } from "../src/lib/linkedin-oauth-state-store";

const origin = "https://brain.example";
const redirectUri = `${origin}${LINKEDIN_DIRECT_CALLBACK_PATH}`;

class MemoryTokenStore implements LinkedInOAuthTokenStore {
  token: LinkedInOAuthToken | undefined;
  clearCount = 0;

  async getAccessToken(): Promise<string | undefined> {
    return this.token?.accessToken;
  }

  async getStatus(): Promise<LinkedInOAuthConnectionStatus> {
    return this.token
      ? {
          connected: true,
          expiresAt: 1_800_000_000_000,
          ...(this.token.scope ? { scope: this.token.scope } : {}),
        }
      : { connected: false };
  }

  async storeToken(token: LinkedInOAuthToken): Promise<void> {
    this.token = token;
  }

  async clearToken(): Promise<void> {
    this.clearCount += 1;
    this.token = undefined;
  }
}

function anchorRequest(url: string): Request {
  return new Request(url, {
    headers: { "x-test-anchor": "true" },
  });
}

function adminActionRequest(
  path: string,
  action: (typeof LINKEDIN_ADMIN_MUTATION_ACTIONS)[keyof typeof LINKEDIN_ADMIN_MUTATION_ACTIONS],
  options: {
    anchor?: boolean | undefined;
    requestOrigin?: string | undefined;
    confirmation?: string | undefined;
  } = {},
): Request {
  return new Request(`${origin}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: options.requestOrigin ?? origin,
      ...(options.anchor === false ? {} : { "x-test-anchor": "true" }),
    },
    body: JSON.stringify({
      action,
      confirmation: options.confirmation ?? action,
    }),
  });
}

function findRoute(
  routes: ReturnType<typeof createLinkedInOAuthRoutes>,
  path: string,
): ReturnType<typeof createLinkedInOAuthRoutes>[number] {
  const route = routes.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`Missing route: ${path}`);
  return route;
}

describe("LinkedIn OAuth routes", () => {
  it("gates admin routes on Anchor, same-origin, and confirmed actions", async () => {
    const routes = createLinkedInOAuthRoutes({
      client: new LinkedInOAuthClient("client-id", "client-secret"),
      tokenStore: new MemoryTokenStore(),
      redirectUri,
      resolveAnchorSession: async (request): Promise<boolean> =>
        request.headers.get("x-test-anchor") === "true",
    });
    const status = findRoute(routes, LINKEDIN_ADMIN_STATUS_PATH);
    const connect = findRoute(routes, LINKEDIN_ADMIN_CONNECT_PATH);

    const statusResponse = await status.handler(
      new Request(`${origin}${LINKEDIN_ADMIN_STATUS_PATH}`),
    );
    const unauthenticated = await connect.handler(
      adminActionRequest(
        LINKEDIN_ADMIN_CONNECT_PATH,
        LINKEDIN_ADMIN_MUTATION_ACTIONS.connectLinkedIn,
        { anchor: false },
      ),
    );
    const crossOrigin = await connect.handler(
      adminActionRequest(
        LINKEDIN_ADMIN_CONNECT_PATH,
        LINKEDIN_ADMIN_MUTATION_ACTIONS.connectLinkedIn,
        { requestOrigin: "https://attacker.example" },
      ),
    );
    const unconfirmed = await connect.handler(
      adminActionRequest(
        LINKEDIN_ADMIN_CONNECT_PATH,
        LINKEDIN_ADMIN_MUTATION_ACTIONS.connectLinkedIn,
        { confirmation: "no" },
      ),
    );

    expect(statusResponse.status).toBe(403);
    expect(unauthenticated.status).toBe(403);
    expect(crossOrigin.status).toBe(403);
    expect(unconfirmed.status).toBe(400);
  });

  it("starts least-privilege authorization with expiring server-side state", async () => {
    const routes = createLinkedInOAuthRoutes({
      client: new LinkedInOAuthClient("client-id", "client-secret"),
      tokenStore: new MemoryTokenStore(),
      stateStore: new LinkedInOAuthStateStore({
        generateState: (): string => "single-use-state",
      }),
      redirectUri,
      resolveAnchorSession: async (): Promise<boolean> => true,
    });

    const response = await findRoute(
      routes,
      LINKEDIN_ADMIN_CONNECT_PATH,
    ).handler(
      adminActionRequest(
        LINKEDIN_ADMIN_CONNECT_PATH,
        LINKEDIN_ADMIN_MUTATION_ACTIONS.connectLinkedIn,
      ),
    );
    const body = (await response.json()) as { authorizationUrl: string };
    const location = new URL(body.authorizationUrl);

    expect(response.status).toBe(200);
    expect(location.origin + location.pathname).toBe(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(location.searchParams.get("state")).toBe("single-use-state");
    expect(location.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(location.searchParams.get("scope")).toBe(LINKEDIN_PORTABILITY_SCOPE);
  });

  it("exchanges a valid direct callback once and never exposes the token", async () => {
    const store = new MemoryTokenStore();
    let exchanges = 0;
    const client = new LinkedInOAuthClient(
      "client-id",
      "client-secret",
      async (): Promise<Response> => {
        exchanges += 1;
        return Response.json({
          access_token: "secret-access-token",
          expires_in: 3600,
          scope: LINKEDIN_PORTABILITY_SCOPE,
          token_type: "Bearer",
        });
      },
    );
    const routes = createLinkedInOAuthRoutes({
      client,
      tokenStore: store,
      stateStore: new LinkedInOAuthStateStore({
        generateState: (): string => "callback-state",
      }),
      redirectUri,
      resolveAnchorSession: async (request): Promise<boolean> =>
        request.headers.get("x-test-anchor") === "true",
    });

    await findRoute(routes, LINKEDIN_ADMIN_CONNECT_PATH).handler(
      adminActionRequest(
        LINKEDIN_ADMIN_CONNECT_PATH,
        LINKEDIN_ADMIN_MUTATION_ACTIONS.connectLinkedIn,
      ),
    );
    const callback = findRoute(routes, LINKEDIN_DIRECT_CALLBACK_PATH);
    const callbackUrl = `${redirectUri}?code=authorization-code&state=callback-state`;
    const response = await callback.handler(new Request(callbackUrl));
    const replay = await callback.handler(new Request(callbackUrl));
    const statusResponse = await findRoute(
      routes,
      LINKEDIN_ADMIN_STATUS_PATH,
    ).handler(anchorRequest(`${origin}${LINKEDIN_ADMIN_STATUS_PATH}`));
    const statusBody = await statusResponse.text();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/admin?section=integrations&provider=linkedin&status=connected",
    );
    expect(replay.status).toBe(400);
    expect(exchanges).toBe(1);
    expect(await store.getAccessToken()).toBe("secret-access-token");
    expect(JSON.parse(statusBody)).toMatchObject({
      connected: true,
      requestedScope: LINKEDIN_PORTABILITY_SCOPE,
      staticAccessTokenConfigured: false,
    });
    expect(statusBody).not.toContain("secret-access-token");
  });

  it("rejects invalid direct callback state before exchanging a code", async () => {
    let exchanges = 0;
    const routes = createLinkedInOAuthRoutes({
      client: new LinkedInOAuthClient(
        "client-id",
        "client-secret",
        async (): Promise<Response> => {
          exchanges += 1;
          return Response.json({ access_token: "token", expires_in: 3600 });
        },
      ),
      tokenStore: new MemoryTokenStore(),
      redirectUri,
      resolveAnchorSession: async (): Promise<boolean> => true,
    });

    const response = await findRoute(
      routes,
      LINKEDIN_DIRECT_CALLBACK_PATH,
    ).handler(new Request(`${redirectUri}?code=code&state=forged`));

    expect(response.status).toBe(400);
    expect(exchanges).toBe(0);
  });

  it("disconnects only after an Anchor confirms the action", async () => {
    const store = new MemoryTokenStore();
    store.token = { accessToken: "secret", expiresIn: 3600 };
    const routes = createLinkedInOAuthRoutes({
      client: new LinkedInOAuthClient("client-id", "client-secret"),
      tokenStore: store,
      redirectUri,
      resolveAnchorSession: async (request): Promise<boolean> =>
        request.headers.get("x-test-anchor") === "true",
    });
    const disconnect = findRoute(routes, LINKEDIN_ADMIN_DISCONNECT_PATH);

    const denied = await disconnect.handler(
      adminActionRequest(
        LINKEDIN_ADMIN_DISCONNECT_PATH,
        LINKEDIN_ADMIN_MUTATION_ACTIONS.disconnectLinkedIn,
        { anchor: false },
      ),
    );
    const response = await disconnect.handler(
      adminActionRequest(
        LINKEDIN_ADMIN_DISCONNECT_PATH,
        LINKEDIN_ADMIN_MUTATION_ACTIONS.disconnectLinkedIn,
      ),
    );

    expect(denied.status).toBe(403);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ disconnected: true });
    expect(store.clearCount).toBe(1);
    expect(await store.getAccessToken()).toBeUndefined();
  });
});
