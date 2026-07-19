import { describe, expect, it } from "bun:test";
import { z } from "@brains/utils/zod";
import { LinkedInBrokerClient } from "../src/lib/linkedin-broker-client";
import {
  LINKEDIN_PORTABILITY_SCOPE,
  type LinkedInOAuthConnectionStatus,
  type LinkedInOAuthToken,
  type LinkedInOAuthTokenStore,
} from "../src/lib/linkedin-oauth-client";
import {
  createLinkedInOAuthRoutes,
  LINKEDIN_ADMIN_CONNECT_PATH,
  LINKEDIN_ADMIN_MUTATION_ACTIONS,
  LINKEDIN_ADMIN_STATUS_PATH,
  LINKEDIN_BROKER_RETURN_PATH,
} from "../src/lib/linkedin-oauth-routes";
import { LinkedInOAuthStateStore } from "../src/lib/linkedin-oauth-state-store";

const origin = "https://brain.example";
const localState = "local-state-000000000000000000000000";
const grant = "grant-00000000000000000000000000000000000";

class MemoryTokenStore implements LinkedInOAuthTokenStore {
  token: LinkedInOAuthToken | undefined;

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
    this.token = undefined;
  }
}

function findRoute(
  routes: ReturnType<typeof createLinkedInOAuthRoutes>,
  path: string,
): ReturnType<typeof createLinkedInOAuthRoutes>[number] {
  const route = routes.find((candidate) => candidate.path === path);
  if (!route) throw new Error(`Missing route: ${path}`);
  return route;
}

function connectRequest(): Request {
  const action = LINKEDIN_ADMIN_MUTATION_ACTIONS.connectLinkedIn;
  return new Request(`${origin}${LINKEDIN_ADMIN_CONNECT_PATH}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      "x-test-anchor": "true",
    },
    body: JSON.stringify({ action, confirmation: action }),
  });
}

describe("managed LinkedIn OAuth routes", () => {
  it("redeems the broker grant into the brain token store without browser token exposure", async () => {
    const requests: Request[] = [];
    const store = new MemoryTokenStore();
    const brokerClient = new LinkedInBrokerClient({
      baseUrl: "https://connect.example",
      instanceId: "brain-one",
      instanceSecret: "instance-secret-000000000000000000000000",
      fetch: async (input, init): Promise<Response> => {
        const request = new Request(input, init);
        requests.push(request);
        if (new URL(request.url).pathname.endsWith("/authorizations")) {
          return Response.json({
            authorizationUrl:
              "https://www.linkedin.com/oauth/v2/authorization?state=central-state",
          });
        }
        return Response.json({
          provider: "linkedin",
          credential: {
            accessToken: "owner-access-token",
            expiresIn: 3600,
            scope: LINKEDIN_PORTABILITY_SCOPE,
            tokenType: "Bearer",
          },
        });
      },
    });
    const routes = createLinkedInOAuthRoutes({
      mode: "broker",
      brokerClient,
      tokenStore: store,
      stateStore: new LinkedInOAuthStateStore({
        generateState: (): string => localState,
      }),
      resolveAnchorSession: async (request): Promise<boolean> =>
        request.headers.get("x-test-anchor") === "true",
    });

    const connectResponse = await findRoute(
      routes,
      LINKEDIN_ADMIN_CONNECT_PATH,
    ).handler(connectRequest());
    const connectBody = z
      .object({ authorizationUrl: z.url() })
      .parse(await connectResponse.json());
    const callbackUrl = new URL(`${origin}${LINKEDIN_BROKER_RETURN_PATH}`);
    callbackUrl.searchParams.set("provider", "linkedin");
    callbackUrl.searchParams.set("state", localState);
    callbackUrl.searchParams.set("grant", grant);
    const callback = findRoute(routes, LINKEDIN_BROKER_RETURN_PATH);
    const callbackResponse = await callback.handler(new Request(callbackUrl));
    const replay = await callback.handler(new Request(callbackUrl));
    const statusResponse = await findRoute(
      routes,
      LINKEDIN_ADMIN_STATUS_PATH,
    ).handler(
      new Request(`${origin}${LINKEDIN_ADMIN_STATUS_PATH}`, {
        headers: { "x-test-anchor": "true" },
      }),
    );
    const statusBody = await statusResponse.text();

    expect(connectResponse.status).toBe(200);
    expect(connectBody.authorizationUrl).toStartWith(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(callbackResponse.status).toBe(303);
    expect(callbackResponse.headers.get("location")).toBe(
      "/admin?section=integrations&provider=linkedin&status=connected",
    );
    expect(callbackResponse.headers.get("location")).not.toContain(
      "owner-access-token",
    );
    expect(replay.status).toBe(400);
    expect(requests).toHaveLength(2);
    expect(await store.getAccessToken()).toBe("owner-access-token");
    expect(JSON.parse(statusBody)).toMatchObject({
      connected: true,
      connectionMode: "broker",
      requestedScope: LINKEDIN_PORTABILITY_SCOPE,
    });
    expect(statusBody).not.toContain("owner-access-token");
  });

  it("consumes local state before rejecting an unexpected provider", async () => {
    let brokerCalls = 0;
    const routes = createLinkedInOAuthRoutes({
      mode: "broker",
      brokerClient: new LinkedInBrokerClient({
        baseUrl: "https://connect.example",
        instanceId: "brain-one",
        instanceSecret: "instance-secret-000000000000000000000000",
        fetch: async (): Promise<Response> => {
          brokerCalls += 1;
          return Response.json({
            authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization",
          });
        },
      }),
      tokenStore: new MemoryTokenStore(),
      stateStore: new LinkedInOAuthStateStore({
        generateState: (): string => localState,
      }),
      resolveAnchorSession: async (): Promise<boolean> => true,
    });
    await findRoute(routes, LINKEDIN_ADMIN_CONNECT_PATH).handler(
      connectRequest(),
    );
    const callback = findRoute(routes, LINKEDIN_BROKER_RETURN_PATH);
    const invalidUrl = `${origin}${LINKEDIN_BROKER_RETURN_PATH}?provider=google&state=${localState}&grant=${grant}`;

    const invalid = await callback.handler(new Request(invalidUrl));
    const replay = await callback.handler(
      new Request(
        `${origin}${LINKEDIN_BROKER_RETURN_PATH}?provider=linkedin&state=${localState}&grant=${grant}`,
      ),
    );

    expect(invalid.status).toBe(400);
    expect(replay.status).toBe(400);
    expect(brokerCalls).toBe(1);
  });
});
