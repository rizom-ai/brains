import { describe, expect, it } from "bun:test";
import type { LinkedInFetch } from "../src/lib/linkedin-client";
import {
  LINKEDIN_PORTABILITY_SCOPE,
  LinkedInOAuthClient,
} from "../src/lib/linkedin-oauth-client";
import {
  LINKEDIN_OAUTH_BROKER_PROVIDER_ID,
  LinkedInOAuthBrokerProvider,
} from "../src/lib/linkedin-oauth-broker-provider";

describe("LinkedInOAuthBrokerProvider", () => {
  it("owns LinkedIn authorization scope and canonical credential exchange", async () => {
    const fetchFn: LinkedInFetch = async (): Promise<Response> =>
      Response.json({
        access_token: "owner-access-token",
        expires_in: 3600,
        scope: LINKEDIN_PORTABILITY_SCOPE,
        token_type: "Bearer",
      });
    const provider = new LinkedInOAuthBrokerProvider(
      new LinkedInOAuthClient("client-id", "client-secret", fetchFn),
    );

    const authorizationUrl = provider.createAuthorizationUrl({
      redirectUri: "https://connect.example/oauth-broker/callback/linkedin",
      state: "broker-state",
    });
    const credential = await provider.exchangeCode({
      code: "provider-code",
      redirectUri: "https://connect.example/oauth-broker/callback/linkedin",
    });

    expect(provider.id).toBe(LINKEDIN_OAUTH_BROKER_PROVIDER_ID);
    expect(authorizationUrl.searchParams.get("scope")).toBe(
      LINKEDIN_PORTABILITY_SCOPE,
    );
    expect(credential).toEqual({
      accessToken: "owner-access-token",
      expiresIn: 3600,
      scope: LINKEDIN_PORTABILITY_SCOPE,
      tokenType: "Bearer",
    });
  });

  it("rejects a credential for a different granted scope", async () => {
    const fetchFn: LinkedInFetch = async (): Promise<Response> =>
      Response.json({
        access_token: "must-not-be-used",
        expires_in: 3600,
        scope: "different_scope",
      });
    const provider = new LinkedInOAuthBrokerProvider(
      new LinkedInOAuthClient("client-id", "client-secret", fetchFn),
    );

    expect(
      provider.exchangeCode({
        code: "provider-code",
        redirectUri: "https://connect.example/oauth-broker/callback/linkedin",
      }),
    ).rejects.toThrow("omitted the requested portability scope");
  });
});
