import { describe, expect, it, mock } from "bun:test";
import {
  LINKEDIN_ACCESS_TOKEN_URL,
  LINKEDIN_AUTHORIZATION_URL,
  LINKEDIN_PORTABILITY_SCOPE,
  LinkedInOAuthClient,
} from "../src/lib/linkedin-oauth-client";
import type { LinkedInFetch } from "../src/lib/linkedin-client";

describe("LinkedInOAuthClient", () => {
  it("builds the documented least-privilege authorization URL", () => {
    const client = new LinkedInOAuthClient("client-id", "client-secret");

    const url = client.createAuthorizationUrl({
      redirectUri: "https://brain.example.com/linkedin/callback",
      state: "random-state",
    });

    expect(url.origin + url.pathname).toBe(LINKEDIN_AUTHORIZATION_URL);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client-id",
      redirect_uri: "https://brain.example.com/linkedin/callback",
      state: "random-state",
      scope: LINKEDIN_PORTABILITY_SCOPE,
    });
    expect(url.toString()).not.toContain("client-secret");
  });

  it("exchanges an authorization code using form-encoded credentials", async () => {
    const fetchMock = mock(
      async (_input: string | URL | Request, init?: RequestInit) => {
        const body = new URLSearchParams(String(init?.body));
        expect(init?.method).toBe("POST");
        expect(init?.headers).toEqual({
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        });
        expect(Object.fromEntries(body)).toEqual({
          grant_type: "authorization_code",
          code: "authorization-code",
          client_id: "client-id",
          client_secret: "client-secret",
          redirect_uri: "https://brain.example.com/linkedin/callback",
        });
        return Response.json({
          access_token: "access-token",
          expires_in: 5_184_000,
          scope: LINKEDIN_PORTABILITY_SCOPE,
          token_type: "Bearer",
          refresh_token: "not-yet-a-supported-contract",
        });
      },
    );
    const client = new LinkedInOAuthClient(
      "client-id",
      "client-secret",
      fetchMock as LinkedInFetch,
    );

    const token = await client.exchangeCode({
      code: "authorization-code",
      redirectUri: "https://brain.example.com/linkedin/callback",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(LINKEDIN_ACCESS_TOKEN_URL);
    expect(token).toEqual({
      accessToken: "access-token",
      expiresIn: 5_184_000,
      scope: LINKEDIN_PORTABILITY_SCOPE,
      tokenType: "Bearer",
    });
  });

  it("surfaces bounded OAuth errors without exposing malformed payloads", async () => {
    const fetchFn = mock(async () =>
      Response.json(
        { error: "invalid_request", error_description: "x".repeat(800) },
        { status: 400 },
      ),
    ) as LinkedInFetch;
    const client = new LinkedInOAuthClient("id", "secret", fetchFn);

    const error = await client
      .exchangeCode({
        code: "code",
        redirectUri: "https://brain.example.com/linkedin/callback",
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message.length).toBeLessThan(600);
    expect((error as Error).message).toContain("invalid_request");
  });

  it("rejects invalid configuration, callback input, and token responses", async () => {
    expect(() => new LinkedInOAuthClient("", "secret")).toThrow(
      "client ID must not be empty",
    );
    const client = new LinkedInOAuthClient(
      "id",
      "secret",
      mock(async () =>
        Response.json({ access_token: "token" }),
      ) as LinkedInFetch,
    );

    expect(() =>
      client.createAuthorizationUrl({
        redirectUri: "javascript:alert(1)",
        state: "state",
      }),
    ).toThrow("must use HTTP or HTTPS");
    expect(
      client.exchangeCode({
        code: "code",
        redirectUri: "https://brain.example.com/linkedin/callback",
      }),
    ).rejects.toThrow("omitted required fields");
  });
});
