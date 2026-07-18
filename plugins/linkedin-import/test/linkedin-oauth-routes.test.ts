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
  LINKEDIN_OAUTH_CALLBACK_PATH,
  LINKEDIN_OAUTH_CONNECT_PATH,
  LINKEDIN_OAUTH_DISCONNECT_PATH,
  LINKEDIN_OAUTH_STATUS_PATH,
} from "../src/lib/linkedin-oauth-routes";
import { LinkedInOAuthStateStore } from "../src/lib/linkedin-oauth-state-store";

const redirectUri = "https://brain.example/linkedin/callback";

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

function operatorRequest(url: string, method = "GET"): Request {
  return new Request(url, {
    method,
    headers: { "x-test-operator": "true" },
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

describe("LinkedIn OAuth browser routes", () => {
  it("gates status and connect on the operator session", async () => {
    const store = new MemoryTokenStore();
    const routes = createLinkedInOAuthRoutes({
      client: new LinkedInOAuthClient("client-id", "client-secret"),
      tokenStore: store,
      redirectUri,
      resolveOperatorSession: async (request): Promise<boolean> =>
        request.headers.get("x-test-operator") === "true",
    });

    const statusResponse = await findRoute(
      routes,
      LINKEDIN_OAUTH_STATUS_PATH,
    ).handler(new Request("https://brain.example/linkedin"));
    const connectResponse = await findRoute(
      routes,
      LINKEDIN_OAUTH_CONNECT_PATH,
    ).handler(
      new Request("https://brain.example/linkedin/connect", { method: "POST" }),
    );

    expect(statusResponse.status).toBe(302);
    expect(statusResponse.headers.get("location")).toBe(
      "/login?return_to=%2Flinkedin",
    );
    expect(connectResponse.status).toBe(403);
  });

  it("starts least-privilege authorization with expiring server-side state", async () => {
    const routes = createLinkedInOAuthRoutes({
      client: new LinkedInOAuthClient("client-id", "client-secret"),
      tokenStore: new MemoryTokenStore(),
      stateStore: new LinkedInOAuthStateStore({
        generateState: (): string => "single-use-state",
      }),
      redirectUri,
      resolveOperatorSession: async (): Promise<boolean> => true,
    });

    const response = await findRoute(
      routes,
      LINKEDIN_OAUTH_CONNECT_PATH,
    ).handler(
      operatorRequest("https://brain.example/linkedin/connect", "POST"),
    );
    const location = new URL(response.headers.get("location") ?? "");

    expect(response.status).toBe(303);
    expect(location.origin + location.pathname).toBe(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(location.searchParams.get("state")).toBe("single-use-state");
    expect(location.searchParams.get("redirect_uri")).toBe(redirectUri);
    expect(location.searchParams.get("scope")).toBe(LINKEDIN_PORTABILITY_SCOPE);
  });

  it("exchanges a valid public callback once and never exposes the token", async () => {
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
      resolveOperatorSession: async (request): Promise<boolean> =>
        request.headers.get("x-test-operator") === "true",
    });

    await findRoute(routes, LINKEDIN_OAUTH_CONNECT_PATH).handler(
      operatorRequest("https://brain.example/linkedin/connect", "POST"),
    );
    const callback = findRoute(routes, LINKEDIN_OAUTH_CALLBACK_PATH);
    const response = await callback.handler(
      new Request(
        "https://brain.example/linkedin/callback?code=authorization-code&state=callback-state",
      ),
    );
    const replay = await callback.handler(
      new Request(
        "https://brain.example/linkedin/callback?code=authorization-code&state=callback-state",
      ),
    );
    const statusResponse = await findRoute(
      routes,
      LINKEDIN_OAUTH_STATUS_PATH,
    ).handler(operatorRequest("https://brain.example/linkedin"));
    const statusHtml = await statusResponse.text();

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/linkedin?status=connected");
    expect(replay.status).toBe(400);
    expect(exchanges).toBe(1);
    expect(await store.getAccessToken()).toBe("secret-access-token");
    expect(statusHtml).toContain("OAuth connection active");
    expect(statusHtml).not.toContain("secret-access-token");
  });

  it("rejects invalid callback state before exchanging a code", async () => {
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
      resolveOperatorSession: async (): Promise<boolean> => true,
    });

    const response = await findRoute(
      routes,
      LINKEDIN_OAUTH_CALLBACK_PATH,
    ).handler(
      new Request(
        "https://brain.example/linkedin/callback?code=code&state=forged",
      ),
    );

    expect(response.status).toBe(400);
    expect(exchanges).toBe(0);
  });

  it("disconnects only for an operator and clears the reusable credential", async () => {
    const store = new MemoryTokenStore();
    store.token = { accessToken: "secret", expiresIn: 3600 };
    const routes = createLinkedInOAuthRoutes({
      client: new LinkedInOAuthClient("client-id", "client-secret"),
      tokenStore: store,
      redirectUri,
      resolveOperatorSession: async (request): Promise<boolean> =>
        request.headers.get("x-test-operator") === "true",
    });
    const disconnect = findRoute(routes, LINKEDIN_OAUTH_DISCONNECT_PATH);

    const denied = await disconnect.handler(
      new Request("https://brain.example/linkedin/disconnect", {
        method: "POST",
      }),
    );
    const response = await disconnect.handler(
      operatorRequest("https://brain.example/linkedin/disconnect", "POST"),
    );

    expect(denied.status).toBe(403);
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "/linkedin?status=disconnected",
    );
    expect(store.clearCount).toBe(1);
    expect(await store.getAccessToken()).toBeUndefined();
  });
});
