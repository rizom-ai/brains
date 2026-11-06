import {
  OAUTH_BROKER_PATHS,
  oauthBrokerAuthorizationResponseSchema,
  oauthBrokerGrantRedemptionResponseSchema,
  type JsonObject,
  type OAuthBrokerProvider,
} from "@brains/contracts";
import { z } from "@brains/utils/zod";
import type { LinkedInFetch } from "./linkedin-client";
import { LinkedInOAuthClient, type LinkedInToken } from "./linkedin-oauth";

export const LINKEDIN_PROVIDER = "linkedin";

const tokenSchema = z.strictObject({
  accessToken: z.string().min(1),
  expiresAt: z.iso.datetime(),
});

/**
 * LinkedIn's side of the managed broker: its consent URL and code exchange,
 * run on the central brain against the shared LinkedIn app.
 */
export function createLinkedInBrokerProvider(
  app: { clientId: string; clientSecret: string },
  deps: { fetch?: LinkedInFetch; now?: () => number } = {},
): OAuthBrokerProvider {
  const client = (redirectUri: string): LinkedInOAuthClient =>
    new LinkedInOAuthClient({ ...app, redirectUri }, deps.fetch);
  const now = deps.now ?? Date.now;
  return {
    id: LINKEDIN_PROVIDER,
    authorizationUrl: ({ redirectUri, state }): URL =>
      client(redirectUri).authorizationUrl(state),
    exchange: async ({ code, redirectUri }): Promise<JsonObject> => {
      const token = await client(redirectUri).exchange(code, now());
      return { accessToken: token.accessToken, expiresAt: token.expiresAt };
    },
  };
}

export interface LinkedInBrokerConfig {
  url: string;
  instanceId: string;
  secret: string;
}

/** The instance brain's client for the managed broker. */
export class LinkedInBrokerClient {
  private readonly config: LinkedInBrokerConfig;
  private readonly fetchFn: LinkedInFetch;

  constructor(
    config: LinkedInBrokerConfig,
    fetchFn: LinkedInFetch = globalThis.fetch,
  ) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  /** LinkedIn's consent URL, routed through the broker's callback. */
  async authorize(brainState: string): Promise<URL> {
    const response = await this.post(
      OAUTH_BROKER_PATHS.authorizations,
      { provider: LINKEDIN_PROVIDER, brainState },
      "the connection",
    );
    return new URL(
      oauthBrokerAuthorizationResponseSchema.parse(response).authorizationUrl,
    );
  }

  /** Redeems a one-time grant for the LinkedIn token, server to server. */
  async redeem(grant: string): Promise<LinkedInToken> {
    const response = oauthBrokerGrantRedemptionResponseSchema.parse(
      await this.post(
        OAUTH_BROKER_PATHS.redeem,
        { provider: LINKEDIN_PROVIDER, grant },
        "grant redemption",
      ),
    );
    if (response.provider !== LINKEDIN_PROVIDER) {
      throw new Error("OAuth broker redeemed a grant for another provider");
    }
    return tokenSchema.parse(response.credential);
  }

  private async post(
    path: string,
    body: Record<string, string>,
    operation: string,
  ): Promise<unknown> {
    const { instanceId, secret } = this.config;
    const response = await this.fetchFn(new URL(path, this.config.url), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Basic ${Buffer.from(`${instanceId}:${secret}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`OAuth broker refused ${operation} (${response.status})`);
    }
    return response.json();
  }
}
