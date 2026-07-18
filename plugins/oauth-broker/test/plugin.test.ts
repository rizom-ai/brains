import { describe, expect, it } from "bun:test";
import type {
  OAuthBrokerCredential,
  OAuthBrokerProvider,
} from "../src/contracts";
import { OAuthBrokerPlugin } from "../src/plugin";
import {
  oauthBrokerCallbackPath,
  OAUTH_BROKER_AUTHORIZATIONS_PATH,
  OAUTH_BROKER_GRANT_REDEMPTION_PATH,
} from "../src/routes";

const publicBaseUrl = "https://connect.example";
const brainOneReturn = "https://one.example/linkedin/oauth/broker/return";
const brainTwoReturn = "https://two.example/linkedin/oauth/broker/return";
const brainOneSecret = "brain-one-secret-000000000000000000000000";
const brainTwoSecret = "brain-two-secret-000000000000000000000000";

function basic(instanceId: string, secret: string): string {
  return `Basic ${Buffer.from(`${instanceId}:${secret}`).toString("base64")}`;
}

function machineRequest(
  path: string,
  instanceId: string,
  secret: string,
  body: unknown,
): Request {
  return new Request(`${publicBaseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: basic(instanceId, secret),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

function findRoute(
  plugin: OAuthBrokerPlugin,
  path: string,
): ReturnType<OAuthBrokerPlugin["getWebRoutes"]>[number] {
  const route = plugin
    .getWebRoutes()
    .find((candidate) => candidate.path === path);
  if (!route) throw new Error(`Missing route: ${path}`);
  return route;
}

function createProvider(): OAuthBrokerProvider & {
  exchanges: string[];
} {
  const exchanges: string[] = [];
  return {
    id: "linkedin",
    exchanges,
    createAuthorizationUrl: ({ redirectUri, state }): URL => {
      const url = new URL("https://provider.example/authorize");
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("state", state);
      return url;
    },
    exchangeCode: async ({
      code,
      redirectUri,
    }): Promise<OAuthBrokerCredential> => {
      exchanges.push(`${code}:${redirectUri}`);
      return {
        accessToken: "provider-secret-token",
        expiresIn: 3600,
      };
    },
  };
}

function createPlugin(provider: OAuthBrokerProvider): OAuthBrokerPlugin {
  return new OAuthBrokerPlugin(
    {
      publicBaseUrl,
      instances: [
        {
          id: "brain-one",
          clientSecret: brainOneSecret,
          returnUris: { linkedin: brainOneReturn },
        },
        {
          id: "brain-two",
          clientSecret: brainTwoSecret,
          returnUris: { linkedin: brainTwoReturn },
        },
      ],
    },
    { providers: [provider] },
  );
}

describe("OAuthBrokerPlugin", () => {
  it("registers exact protocol-owned routes on the shared host", () => {
    const plugin = createPlugin(createProvider());

    expect(
      plugin.getWebRoutes().map((route) => [route.method, route.path]),
    ).toEqual([
      ["POST", "/oauth-broker/authorizations"],
      ["POST", "/oauth-broker/grants/redeem"],
      ["GET", "/oauth-broker/callback/linkedin"],
    ]);
  });

  it("authenticates instances and ignores browser-supplied return URIs", async () => {
    const plugin = createPlugin(createProvider());
    const start = findRoute(plugin, OAUTH_BROKER_AUTHORIZATIONS_PATH);

    const unauthenticated = await start.handler(
      new Request(`${publicBaseUrl}${OAUTH_BROKER_AUTHORIZATIONS_PATH}`, {
        method: "POST",
      }),
    );
    const wrongSecret = await start.handler(
      machineRequest(
        OAUTH_BROKER_AUTHORIZATIONS_PATH,
        "brain-one",
        "wrong-secret-00000000000000000000000000000",
        {
          provider: "linkedin",
          brainState: "brain-state-000000000000000000000000",
        },
      ),
    );
    const injectedReturn = await start.handler(
      machineRequest(
        OAUTH_BROKER_AUTHORIZATIONS_PATH,
        "brain-one",
        brainOneSecret,
        {
          provider: "linkedin",
          brainState: "brain-state-000000000000000000000000",
          returnUri: "https://attacker.example/callback",
        },
      ),
    );

    expect(unauthenticated.status).toBe(401);
    expect(wrongSecret.status).toBe(401);
    expect(injectedReturn.status).toBe(400);
  });

  it("delivers a provider credential through a bound one-time grant", async () => {
    const provider = createProvider();
    const plugin = createPlugin(provider);
    const start = findRoute(plugin, OAUTH_BROKER_AUTHORIZATIONS_PATH);
    const startResponse = await start.handler(
      machineRequest(
        OAUTH_BROKER_AUTHORIZATIONS_PATH,
        "brain-one",
        brainOneSecret,
        {
          provider: "linkedin",
          brainState: "brain-state-000000000000000000000000",
        },
      ),
    );
    const startBody = (await startResponse.json()) as {
      authorizationUrl: string;
    };
    const authorizationUrl = new URL(startBody.authorizationUrl);
    const brokerState = authorizationUrl.searchParams.get("state");

    expect(startResponse.status).toBe(200);
    expect(authorizationUrl.searchParams.get("redirect_uri")).toBe(
      `${publicBaseUrl}/oauth-broker/callback/linkedin`,
    );
    expect(brokerState).toBeTruthy();

    const callback = findRoute(plugin, oauthBrokerCallbackPath("linkedin"));
    const callbackResponse = await callback.handler(
      new Request(
        `${publicBaseUrl}/oauth-broker/callback/linkedin?code=provider-code&state=${brokerState}`,
      ),
    );
    const returnLocation = callbackResponse.headers.get("location") ?? "";
    const returnUrl = new URL(returnLocation);
    const grant = returnUrl.searchParams.get("grant");

    expect(callbackResponse.status).toBe(303);
    expect(returnUrl.origin + returnUrl.pathname).toBe(brainOneReturn);
    expect(returnUrl.searchParams.get("state")).toBe(
      "brain-state-000000000000000000000000",
    );
    expect(returnUrl.searchParams.get("provider")).toBe("linkedin");
    expect(grant).toBeTruthy();
    expect(returnLocation).not.toContain("provider-secret-token");
    expect(provider.exchanges).toEqual([
      "provider-code:https://connect.example/oauth-broker/callback/linkedin",
    ]);

    const redeem = findRoute(plugin, OAUTH_BROKER_GRANT_REDEMPTION_PATH);
    const wrongInstance = await redeem.handler(
      machineRequest(
        OAUTH_BROKER_GRANT_REDEMPTION_PATH,
        "brain-two",
        brainTwoSecret,
        { provider: "linkedin", grant },
      ),
    );
    expect(wrongInstance.status).toBe(400);

    const redemptions = await Promise.all([
      redeem.handler(
        machineRequest(
          OAUTH_BROKER_GRANT_REDEMPTION_PATH,
          "brain-one",
          brainOneSecret,
          { provider: "linkedin", grant },
        ),
      ),
      redeem.handler(
        machineRequest(
          OAUTH_BROKER_GRANT_REDEMPTION_PATH,
          "brain-one",
          brainOneSecret,
          { provider: "linkedin", grant },
        ),
      ),
    ]);
    expect(redemptions.map((response) => response.status).sort()).toEqual([
      200, 400,
    ]);
    const successful = redemptions.find((response) => response.status === 200);
    expect(await successful?.json()).toEqual({
      provider: "linkedin",
      credential: {
        accessToken: "provider-secret-token",
        expiresIn: 3600,
      },
    });
  });

  it("returns provider denial to the bound brain without exchanging", async () => {
    const provider = createProvider();
    const plugin = createPlugin(provider);
    const startResponse = await findRoute(
      plugin,
      OAUTH_BROKER_AUTHORIZATIONS_PATH,
    ).handler(
      machineRequest(
        OAUTH_BROKER_AUTHORIZATIONS_PATH,
        "brain-one",
        brainOneSecret,
        {
          provider: "linkedin",
          brainState: "brain-state-000000000000000000000000",
        },
      ),
    );
    const authorizationUrl = new URL(
      ((await startResponse.json()) as { authorizationUrl: string })
        .authorizationUrl,
    );
    const state = authorizationUrl.searchParams.get("state");

    const response = await findRoute(
      plugin,
      oauthBrokerCallbackPath("linkedin"),
    ).handler(
      new Request(
        `${publicBaseUrl}/oauth-broker/callback/linkedin?error=access_denied&state=${state}`,
      ),
    );
    const returnUrl = new URL(response.headers.get("location") ?? "");

    expect(returnUrl.origin + returnUrl.pathname).toBe(brainOneReturn);
    expect(returnUrl.searchParams.get("error")).toBe("provider_denied");
    expect(returnUrl.searchParams.get("grant")).toBeNull();
    expect(provider.exchanges).toEqual([]);
  });
});
