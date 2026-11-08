import { afterEach, describe, expect, it } from "bun:test";
import {
  createPluginHarness,
  type PluginTestHarness,
} from "@brains/plugins/test";
import type { JsonObject, OAuthBrokerProvider } from "@brains/contracts";
import { z } from "@brains/utils/zod";
import { OAuthBrokerPlugin } from "../src/plugin";

const harnesses: PluginTestHarness<OAuthBrokerPlugin>[] = [];
afterEach(async () => {
  for (const harness of harnesses.splice(0)) await harness.reset();
});

const instanceSecret = "i".repeat(40);
const otherSecret = "o".repeat(40);
const brainState = "b".repeat(43);

const config = {
  publicUrl: "https://connect.test",
  providers: { linkedin: { clientId: "app", clientSecret: "app-secret" } },
  instances: [
    {
      id: "ada",
      secret: instanceSecret,
      returnUris: { linkedin: "https://ada.test/linkedin/oauth/broker/return" },
    },
    {
      id: "other",
      secret: otherSecret,
      returnUris: {
        linkedin: "https://other.test/linkedin/oauth/broker/return",
      },
    },
  ],
};

interface Exchanges {
  codes: string[];
  redirectUris: string[];
  appConfig: { clientId: string; clientSecret: string } | undefined;
}

function fakeLinkedIn(
  exchanges: Exchanges,
): (app: { clientId: string; clientSecret: string }) => OAuthBrokerProvider {
  return (appConfig: {
    clientId: string;
    clientSecret: string;
  }): OAuthBrokerProvider => {
    exchanges.appConfig = appConfig;
    return {
      id: "linkedin",
      authorizationUrl: ({ redirectUri, state }): URL => {
        const url = new URL("https://provider.test/authorize");
        url.searchParams.set("redirect_uri", redirectUri);
        url.searchParams.set("state", state);
        return url;
      },
      exchange: async ({ code, redirectUri }): Promise<JsonObject> => {
        exchanges.codes.push(code);
        exchanges.redirectUris.push(redirectUri);
        if (code === "bad") throw new Error("provider refused secret-detail");
        return {
          accessToken: "member-token",
          expiresAt: "2099-01-01T00:00:00Z",
        };
      },
    };
  };
}

interface Fixture {
  plugin: OAuthBrokerPlugin;
  exchanges: Exchanges;
  clock: { now: number };
  request(
    method: "GET" | "POST",
    path: string,
    options?: { body?: unknown; instance?: [string, string] },
  ): Promise<Response>;
  authorize(instance?: [string, string]): Promise<string>;
}

async function fixture(
  overrides: Partial<typeof config> = {},
): Promise<Fixture> {
  const harness = createPluginHarness<OAuthBrokerPlugin>();
  harnesses.push(harness);
  const exchanges: Exchanges = {
    codes: [],
    redirectUris: [],
    appConfig: undefined,
  };
  const clock = { now: 0 };
  const plugin = new OAuthBrokerPlugin(
    { ...config, ...overrides },
    {
      providers: { linkedin: fakeLinkedIn(exchanges) },
      now: (): number => clock.now,
    },
  );
  await harness.installPlugin(plugin);
  const request: Fixture["request"] = async (method, path, options = {}) => {
    const url = new URL(path, "https://connect.test");
    const route = plugin
      .getWebRoutes()
      .find(
        (candidate) =>
          candidate.path === url.pathname && candidate.method === method,
      );
    if (!route) return new Response("Not found", { status: 404 });
    const [id, secret] = options.instance ?? [];
    return route.handler(
      new Request(url, {
        method,
        headers: {
          ...(options.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
          ...(id
            ? {
                Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
              }
            : {}),
        },
        ...(options.body === undefined
          ? {}
          : { body: JSON.stringify(options.body) }),
      }),
      { remoteAddress: "10.0.0.1" },
    );
  };
  const authorize = async (
    instance: [string, string] = ["ada", instanceSecret],
  ): Promise<string> => {
    const response = await request("POST", "/oauth-broker/authorizations", {
      body: { provider: "linkedin", brainState },
      instance,
    });
    const { authorizationUrl } = z
      .object({ authorizationUrl: z.string() })
      .parse(await response.json());
    return new URL(authorizationUrl).searchParams.get("state") ?? "";
  };
  return { plugin, exchanges, clock, request, authorize };
}

function returned(response: Response): URL {
  return new URL(response.headers.get("Location") ?? "");
}

async function grantFor(state: Fixture, code = "code-1"): Promise<string> {
  const brokerState = await state.authorize();
  const callback = await state.request(
    "GET",
    `/oauth-broker/callback/linkedin?code=${code}&state=${brokerState}`,
  );
  return returned(callback).searchParams.get("grant") ?? "";
}

describe("OAuth broker", () => {
  it("serves nothing without registered instances", async () => {
    const state = await fixture({ instances: [] });
    expect(state.plugin.getWebRoutes()).toEqual([]);
  });

  it("refuses an unknown or wrongly authenticated instance", async () => {
    const state = await fixture();
    const body = { provider: "linkedin", brainState };

    for (const instance of [
      undefined,
      ["ada", "wrong".repeat(10)],
      ["nobody", instanceSecret],
    ] as const) {
      const response = await state.request(
        "POST",
        "/oauth-broker/authorizations",
        { body, ...(instance ? { instance: [...instance] } : {}) },
      );
      expect(response.status).toBe(401);
    }
  });

  it("starts consent at the provider with the broker's own callback", async () => {
    const state = await fixture();

    const response = await state.request(
      "POST",
      "/oauth-broker/authorizations",
      {
        body: { provider: "linkedin", brainState },
        instance: ["ada", instanceSecret],
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { authorizationUrl } = z
      .object({ authorizationUrl: z.string() })
      .parse(await response.json());
    const consent = new URL(authorizationUrl);
    expect(consent.searchParams.get("redirect_uri")).toBe(
      "https://connect.test/oauth-broker/callback/linkedin",
    );
    expect(consent.searchParams.get("state")).not.toBe(brainState);
    expect(state.exchanges.appConfig).toEqual(config.providers.linkedin);
  });

  it("refuses a provider the instance has no return address for", async () => {
    const state = await fixture();

    const response = await state.request(
      "POST",
      "/oauth-broker/authorizations",
      {
        body: { provider: "github", brainState },
        instance: ["ada", instanceSecret],
      },
    );

    expect(response.status).toBe(400);
  });

  it("sends the browser back to the instance's own address with a grant, never the credential", async () => {
    const state = await fixture();
    const brokerState = await state.authorize();

    const callback = await state.request(
      "GET",
      `/oauth-broker/callback/linkedin?code=code-1&state=${brokerState}`,
    );

    expect(callback.status).toBe(303);
    const back = returned(callback);
    expect(back.origin + back.pathname).toBe(
      "https://ada.test/linkedin/oauth/broker/return",
    );
    expect(back.searchParams.get("provider")).toBe("linkedin");
    expect(back.searchParams.get("state")).toBe(brainState);
    expect(back.searchParams.get("grant")?.length).toBeGreaterThanOrEqual(43);
    expect(back.toString()).not.toContain("member-token");
    expect(state.exchanges.redirectUris).toEqual([
      "https://connect.test/oauth-broker/callback/linkedin",
    ]);
  });

  it("accepts a callback state once", async () => {
    const state = await fixture();
    const brokerState = await state.authorize();
    const path = `/oauth-broker/callback/linkedin?code=code-1&state=${brokerState}`;

    await state.request("GET", path);
    const replayed = await state.request("GET", path);

    expect(replayed.status).toBe(400);
    expect(state.exchanges.codes).toEqual(["code-1"]);
  });

  it("reports a declined consent and a failed exchange to the instance", async () => {
    const state = await fixture();

    const declined = await state.request(
      "GET",
      `/oauth-broker/callback/linkedin?error=user_cancelled&state=${await state.authorize()}`,
    );
    expect(returned(declined).searchParams.get("error")).toBe(
      "provider_denied",
    );

    const failed = await state.request(
      "GET",
      `/oauth-broker/callback/linkedin?code=bad&state=${await state.authorize()}`,
    );
    expect(returned(failed).searchParams.get("error")).toBe(
      "credential_exchange_failed",
    );
    expect(returned(failed).toString()).not.toContain("secret-detail");
  });

  it("hands the credential once, to the instance it was granted for", async () => {
    const state = await fixture();
    const grant = await grantFor(state);
    const redeem = (instance: [string, string]): Promise<Response> =>
      state.request("POST", "/oauth-broker/grants/redeem", {
        body: { provider: "linkedin", grant },
        instance,
      });

    expect((await redeem(["other", otherSecret])).status).toBe(400);
    const redeemed = await redeem(["ada", instanceSecret]);
    expect(redeemed.status).toBe(200);
    expect(await redeemed.json()).toEqual({
      provider: "linkedin",
      credential: {
        accessToken: "member-token",
        expiresAt: "2099-01-01T00:00:00Z",
      },
    });
    expect((await redeem(["ada", instanceSecret])).status).toBe(400);
  });

  it("lets a grant lapse after two minutes", async () => {
    const state = await fixture();
    const grant = await grantFor(state);

    state.clock.now = 2 * 60 * 1000;
    const redeemed = await state.request(
      "POST",
      "/oauth-broker/grants/redeem",
      {
        body: { provider: "linkedin", grant },
        instance: ["ada", instanceSecret],
      },
    );

    expect(redeemed.status).toBe(400);
  });

  it("limits each instance to ten connections started per ten minutes", async () => {
    const state = await fixture();
    const start = (instance: [string, string]): Promise<Response> =>
      state.request("POST", "/oauth-broker/authorizations", {
        body: { provider: "linkedin", brainState },
        instance,
      });

    const first = await Promise.all(
      Array.from({ length: 10 }, () => start(["ada", instanceSecret])),
    );
    expect(first.map((response) => response.status)).toEqual(
      Array.from({ length: 10 }, () => 200),
    );
    expect((await start(["ada", instanceSecret])).status).toBe(429);
    expect((await start(["other", otherSecret])).status).toBe(200);

    state.clock.now = 10 * 60 * 1000;
    expect((await start(["ada", instanceSecret])).status).toBe(200);
  });

  it("refuses to start without an adapter for a configured provider", async () => {
    const harness = createPluginHarness<OAuthBrokerPlugin>();
    harnesses.push(harness);
    const plugin = new OAuthBrokerPlugin(config, { providers: {} });

    expect(harness.installPlugin(plugin)).rejects.toThrow("linkedin");
  });
});
