import { describe, expect, it } from "bun:test";
import {
  OAUTH_BROKER_PATHS,
  oauthBrokerAuthorizationRequestSchema,
  oauthBrokerCallbackPath,
  oauthBrokerGrantRedemptionRequestSchema,
  oauthBrokerGrantRedemptionResponseSchema,
  oauthBrokerReturnSchema,
} from "../src/oauth-broker";

const brainState = "s".repeat(43);
const grant = "g".repeat(43);

describe("OAuth broker protocol", () => {
  it("routes each provider's callback under the broker", () => {
    expect(OAUTH_BROKER_PATHS).toEqual({
      authorizations: "/oauth-broker/authorizations",
      redeem: "/oauth-broker/grants/redeem",
    });
    expect(oauthBrokerCallbackPath("linkedin")).toBe(
      "/oauth-broker/callback/linkedin",
    );
  });

  it("asks for an authorization with a provider and the brain's own state", () => {
    expect(
      oauthBrokerAuthorizationRequestSchema.parse({
        provider: "linkedin",
        brainState,
      }),
    ).toEqual({ provider: "linkedin", brainState });
    expect(
      oauthBrokerAuthorizationRequestSchema.safeParse({
        provider: "linkedin",
        brainState,
        returnUri: "https://elsewhere.test",
      }).success,
    ).toBe(false);
    expect(
      oauthBrokerAuthorizationRequestSchema.safeParse({
        provider: "LinkedIn!",
        brainState,
      }).success,
    ).toBe(false);
    expect(
      oauthBrokerAuthorizationRequestSchema.safeParse({
        provider: "linkedin",
        brainState: "short",
      }).success,
    ).toBe(false);
  });

  it("redeems a grant for an opaque JSON credential", () => {
    expect(
      oauthBrokerGrantRedemptionRequestSchema.safeParse({
        provider: "linkedin",
        grant: "short",
      }).success,
    ).toBe(false);
    expect(
      oauthBrokerGrantRedemptionResponseSchema.parse({
        provider: "linkedin",
        credential: { accessToken: "t", expiresAt: "2026-11-06T00:00:00Z" },
      }).credential,
    ).toEqual({ accessToken: "t", expiresAt: "2026-11-06T00:00:00Z" });
    expect(
      oauthBrokerGrantRedemptionResponseSchema.safeParse({
        provider: "linkedin",
        credential: "token",
      }).success,
    ).toBe(false);
  });

  it("returns to the brain with its state and either a grant or an error", () => {
    expect(
      oauthBrokerReturnSchema.parse({
        provider: "linkedin",
        state: brainState,
        grant,
      }),
    ).toEqual({ provider: "linkedin", state: brainState, grant });
    expect(
      oauthBrokerReturnSchema.parse({
        provider: "linkedin",
        state: brainState,
        error: "provider_denied",
      }),
    ).toEqual({
      provider: "linkedin",
      state: brainState,
      error: "provider_denied",
    });
    expect(
      oauthBrokerReturnSchema.safeParse({
        provider: "linkedin",
        state: brainState,
      }).success,
    ).toBe(false);
  });
});
