import { describe, expect, it } from "bun:test";
import {
  OAUTH_BROKER_AUTHORIZATIONS_PATH,
  OAUTH_BROKER_GRANT_REDEMPTION_PATH,
} from "@brains/oauth-broker";
import { LinkedInBrokerClient } from "../src/lib/linkedin-broker-client";
import { LINKEDIN_PORTABILITY_SCOPE } from "../src/lib/linkedin-oauth-client";

const baseUrl = "https://connect.example";
const instanceId = "brain-one";
const instanceSecret = "instance-secret-000000000000000000000000";
const grant = "grant-00000000000000000000000000000000000";

function createClient(
  fetchFn: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): LinkedInBrokerClient {
  return new LinkedInBrokerClient({
    baseUrl,
    instanceId,
    instanceSecret,
    fetch: fetchFn,
  });
}

describe("LinkedInBrokerClient", () => {
  it("starts LinkedIn authorization as an authenticated broker instance", async () => {
    let request: Request | undefined;
    const client = createClient(async (input, init): Promise<Response> => {
      request = new Request(input, init);
      return Response.json({
        authorizationUrl:
          "https://www.linkedin.com/oauth/v2/authorization?state=broker-state",
      });
    });

    const authorizationUrl = await client.createAuthorizationUrl(
      "brain-state-000000000000000000000000",
    );

    expect(request?.url).toBe(`${baseUrl}${OAUTH_BROKER_AUTHORIZATIONS_PATH}`);
    expect(request?.headers.get("authorization")).toBe(
      `Basic ${Buffer.from(`${instanceId}:${instanceSecret}`).toString("base64")}`,
    );
    expect(await request?.json()).toEqual({
      provider: "linkedin",
      brainState: "brain-state-000000000000000000000000",
    });
    expect(authorizationUrl.hostname).toBe("www.linkedin.com");
  });

  it("redeems and validates a canonical LinkedIn credential", async () => {
    let request: Request | undefined;
    const client = createClient(async (input, init): Promise<Response> => {
      request = new Request(input, init);
      return Response.json({
        provider: "linkedin",
        credential: {
          accessToken: "owner-access-token",
          expiresIn: 3600,
          scope: LINKEDIN_PORTABILITY_SCOPE,
          tokenType: "Bearer",
        },
      });
    });

    const token = await client.redeemGrant(grant);
    expect(token).toEqual({
      accessToken: "owner-access-token",
      expiresIn: 3600,
      scope: LINKEDIN_PORTABILITY_SCOPE,
      tokenType: "Bearer",
    });
    expect(request?.url).toBe(
      `${baseUrl}${OAUTH_BROKER_GRANT_REDEMPTION_PATH}`,
    );
    expect(await request?.json()).toEqual({ provider: "linkedin", grant });
  });

  it("rejects broker and provider contract failures without echoing credentials", async () => {
    const wrongProvider = createClient(async (): Promise<Response> =>
      Response.json({
        provider: "google",
        credential: {
          accessToken: "must-not-appear",
          expiresIn: 3600,
        },
      }),
    );
    const wrongScope = createClient(async (): Promise<Response> =>
      Response.json({
        provider: "linkedin",
        credential: {
          accessToken: "also-must-not-appear",
          expiresIn: 3600,
          scope: "different_scope",
        },
      }),
    );

    const providerError = await wrongProvider
      .redeemGrant(grant)
      .catch((error: unknown): unknown => error);
    const scopeError = await wrongScope
      .redeemGrant(grant)
      .catch((error: unknown): unknown => error);

    expect(providerError).toBeInstanceOf(Error);
    expect(scopeError).toBeInstanceOf(Error);
    expect(String(providerError)).not.toContain("must-not-appear");
    expect(String(scopeError)).not.toContain("also-must-not-appear");
  });

  it("requires HTTPS outside local development", () => {
    expect(
      () =>
        new LinkedInBrokerClient({
          baseUrl: "http://connect.example",
          instanceId,
          instanceSecret,
        }),
    ).toThrow("must use HTTPS outside loopback");
  });
});
