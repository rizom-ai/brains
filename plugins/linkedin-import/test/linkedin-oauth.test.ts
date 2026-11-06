import { describe, expect, it } from "bun:test";
import type { LinkedInFetch } from "../src/lib/linkedin-client";
import {
  LinkedInOAuthClient,
  createOAuthStates,
} from "../src/lib/linkedin-oauth";

const config = {
  clientId: "client-1",
  clientSecret: "secret-1",
  redirectUri: "https://brain.test/linkedin/oauth/callback",
};

function tokenEndpoint(response: Response): {
  fetch: LinkedInFetch;
  requests: { url: string; init: RequestInit | undefined }[];
} {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  return {
    requests,
    fetch: async (input, init): Promise<Response> => {
      requests.push({ url: String(input), init });
      return response;
    },
  };
}

describe("LinkedInOAuthClient", () => {
  it("asks LinkedIn for the portability scope, returning to the callback", () => {
    const url = new LinkedInOAuthClient(config).authorizationUrl("state-1");

    expect(url.origin + url.pathname).toBe(
      "https://www.linkedin.com/oauth/v2/authorization",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client-1",
      redirect_uri: "https://brain.test/linkedin/oauth/callback",
      state: "state-1",
      scope: "r_dma_portability_3rd_party",
    });
  });

  it("exchanges a code server-side for a token and its expiry", async () => {
    const { fetch, requests } = tokenEndpoint(
      Response.json({ access_token: "member-token", expires_in: 3600 }),
    );
    const now = Date.parse("2026-11-05T10:00:00.000Z");

    const token = await new LinkedInOAuthClient(config, fetch).exchange(
      "code-1",
      now,
    );

    expect(token).toEqual({
      accessToken: "member-token",
      expiresAt: "2026-11-05T11:00:00.000Z",
    });
    expect(requests[0]?.url).toBe(
      "https://www.linkedin.com/oauth/v2/accessToken",
    );
    expect(requests[0]?.init?.method).toBe("POST");
    expect(
      Object.fromEntries(new URLSearchParams(String(requests[0]?.init?.body))),
    ).toEqual({
      grant_type: "authorization_code",
      code: "code-1",
      client_id: "client-1",
      client_secret: "secret-1",
      redirect_uri: "https://brain.test/linkedin/oauth/callback",
    });
  });

  it("refuses a token granted without the portability scope", () => {
    const { fetch } = tokenEndpoint(
      Response.json({
        access_token: "member-token",
        expires_in: 3600,
        scope: "r_liteprofile",
      }),
    );

    expect(
      new LinkedInOAuthClient(config, fetch).exchange("code-1", 0),
    ).rejects.toThrow("portability scope");
  });

  it("reports LinkedIn's refusal without the client secret", () => {
    const { fetch } = tokenEndpoint(
      Response.json(
        { error: "invalid_grant", error_description: "Code expired" },
        { status: 400 },
      ),
    );

    expect(
      new LinkedInOAuthClient(config, fetch).exchange("code-1", 0),
    ).rejects.toThrow(
      "LinkedIn refused the code (400): invalid_grant: Code expired",
    );
  });
});

describe("createOAuthStates", () => {
  it("returns the account a state was issued for, once", () => {
    const store = createOAuthStates((): number => 0);
    const state = store.issue("owner");

    expect(store.take(state)).toBe("owner");
    expect(store.take(state)).toBeNull();
  });

  it("forgets a state after ten minutes", () => {
    const clock = { now: 0 };
    const store = createOAuthStates((): number => clock.now);
    const state = store.issue("owner");

    clock.now = 10 * 60 * 1000;

    expect(store.take(state)).toBeNull();
  });

  it("knows no state it did not issue", () => {
    expect(createOAuthStates().take("forged")).toBeNull();
  });
});
