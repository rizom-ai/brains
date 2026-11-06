import { describe, expect, it } from "bun:test";
import type { LinkedInFetch } from "../src/lib/linkedin-client";
import {
  createLinkedInBrokerProvider,
  LinkedInBrokerClient,
} from "../src/lib/linkedin-broker";

interface Recorded {
  url: string;
  init: RequestInit | undefined;
}

function answering(response: Response): {
  fetch: LinkedInFetch;
  requests: Recorded[];
} {
  const requests: Recorded[] = [];
  return {
    requests,
    fetch: async (input, init): Promise<Response> => {
      requests.push({ url: String(input), init });
      return response;
    },
  };
}

const callback = "https://connect.test/oauth-broker/callback/linkedin";
const brainState = "b".repeat(43);
const grant = "g".repeat(43);
const broker = {
  url: "https://connect.test",
  instanceId: "ada",
  secret: "s".repeat(40),
};

describe("LinkedIn broker provider", () => {
  it("asks LinkedIn for consent with the broker's callback", () => {
    const provider = createLinkedInBrokerProvider({
      clientId: "app",
      clientSecret: "app-secret",
    });

    const consent = provider.authorizationUrl({
      redirectUri: callback,
      state: "broker-state",
    });

    expect(provider.id).toBe("linkedin");
    expect(consent.searchParams.get("redirect_uri")).toBe(callback);
    expect(consent.searchParams.get("state")).toBe("broker-state");
    expect(consent.searchParams.get("scope")).toBe(
      "r_dma_portability_3rd_party",
    );
  });

  it("exchanges the code at the broker's callback for a dated token", async () => {
    const { fetch, requests } = answering(
      Response.json({ access_token: "member-token", expires_in: 60 }),
    );
    const provider = createLinkedInBrokerProvider(
      { clientId: "app", clientSecret: "app-secret" },
      { fetch, now: (): number => Date.parse("2026-11-06T00:00:00.000Z") },
    );

    expect(
      await provider.exchange({ code: "code-1", redirectUri: callback }),
    ).toEqual({
      accessToken: "member-token",
      expiresAt: "2026-11-06T00:01:00.000Z",
    });
    expect(
      new URLSearchParams(String(requests[0]?.init?.body)).get("redirect_uri"),
    ).toBe(callback);
  });
});

describe("LinkedInBrokerClient", () => {
  it("starts a connection at the broker as its instance", async () => {
    const { fetch, requests } = answering(
      Response.json({
        authorizationUrl: "https://www.linkedin.com/oauth/v2/authorization?x=1",
      }),
    );

    const consent = await new LinkedInBrokerClient(broker, fetch).authorize(
      brainState,
    );

    expect(consent.hostname).toBe("www.linkedin.com");
    expect(requests[0]?.url).toBe(
      "https://connect.test/oauth-broker/authorizations",
    );
    const headers = new Headers(requests[0]?.init?.headers);
    expect(headers.get("Authorization")).toBe(
      `Basic ${Buffer.from(`ada:${broker.secret}`).toString("base64")}`,
    );
    expect(JSON.parse(String(requests[0]?.init?.body))).toEqual({
      provider: "linkedin",
      brainState,
    });
  });

  it("redeems a grant for the LinkedIn token", async () => {
    const { fetch, requests } = answering(
      Response.json({
        provider: "linkedin",
        credential: {
          accessToken: "member-token",
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
      }),
    );

    expect(await new LinkedInBrokerClient(broker, fetch).redeem(grant)).toEqual(
      {
        accessToken: "member-token",
        expiresAt: "2099-01-01T00:00:00.000Z",
      },
    );
    expect(requests[0]?.url).toBe(
      "https://connect.test/oauth-broker/grants/redeem",
    );
  });

  it("refuses a credential that is not a LinkedIn token", () => {
    const { fetch } = answering(
      Response.json({ provider: "linkedin", credential: { token: "x" } }),
    );

    expect(
      new LinkedInBrokerClient(broker, fetch).redeem(grant),
    ).rejects.toThrow();
  });

  it("reports the broker's refusal by status", () => {
    const { fetch } = answering(
      Response.json({ error: "Invalid or expired grant" }, { status: 400 }),
    );

    expect(
      new LinkedInBrokerClient(broker, fetch).redeem(grant),
    ).rejects.toThrow("OAuth broker refused grant redemption (400)");
  });
});
