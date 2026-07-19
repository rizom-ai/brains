import {
  oauthBrokerAuthorizationResponseSchema,
  oauthBrokerGrantRedemptionResponseSchema,
  OAUTH_BROKER_AUTHORIZATIONS_PATH,
  OAUTH_BROKER_GRANT_REDEMPTION_PATH,
} from "@brains/oauth-broker";
import type { LinkedInFetch } from "./linkedin-client";
import {
  validateLinkedInOAuthToken,
  type LinkedInOAuthToken,
} from "./linkedin-oauth-client";
import { LINKEDIN_OAUTH_BROKER_PROVIDER_ID } from "./linkedin-oauth-broker-provider";

export interface LinkedInBrokerClientOptions {
  baseUrl: string;
  instanceId: string;
  instanceSecret: string;
  fetch?: LinkedInFetch | undefined;
}

function configured(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} must not be empty`);
  return trimmed;
}

function isLoopback(url: URL): boolean {
  return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
}

function validatedBaseUrl(value: string): string {
  const url = new URL(value);
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopback(url))
  ) {
    throw new Error(
      "LinkedIn OAuth broker URL must use HTTPS outside loopback",
    );
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("LinkedIn OAuth broker URL must contain only an origin");
  }
  return url.toString();
}

async function responseJson(
  response: Response,
  operation: string,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new Error(
      `LinkedIn OAuth broker ${operation} returned invalid JSON (${response.status})`,
    );
  }
}

/** Authenticated owner-side client for the managed OAuth broker protocol. */
export class LinkedInBrokerClient {
  private readonly baseUrl: string;
  private readonly authorization: string;
  private readonly fetchFn: LinkedInFetch;

  constructor(options: LinkedInBrokerClientOptions) {
    this.baseUrl = validatedBaseUrl(options.baseUrl);
    const instanceId = configured(
      options.instanceId,
      "OAuth broker instance ID",
    );
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(instanceId)) {
      throw new Error("OAuth broker instance ID has an invalid format");
    }
    const instanceSecret = configured(
      options.instanceSecret,
      "OAuth broker instance secret",
    );
    if (instanceSecret.length < 32) {
      throw new Error("OAuth broker instance secret is too short");
    }
    this.authorization = `Basic ${Buffer.from(`${instanceId}:${instanceSecret}`).toString("base64")}`;
    this.fetchFn = options.fetch ?? globalThis.fetch;
  }

  async createAuthorizationUrl(brainState: string): Promise<URL> {
    const payload = await this.request(
      OAUTH_BROKER_AUTHORIZATIONS_PATH,
      {
        provider: LINKEDIN_OAUTH_BROKER_PROVIDER_ID,
        brainState: configured(brainState, "LinkedIn OAuth state"),
      },
      "authorization",
    );
    const parsed = oauthBrokerAuthorizationResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error(
        "LinkedIn OAuth broker returned an invalid authorization response",
      );
    }
    const authorizationUrl = new URL(parsed.data.authorizationUrl);
    if (
      authorizationUrl.protocol !== "https:" &&
      !(authorizationUrl.protocol === "http:" && isLoopback(authorizationUrl))
    ) {
      throw new Error("LinkedIn OAuth authorization URL must use HTTPS");
    }
    return authorizationUrl;
  }

  async redeemGrant(grant: string): Promise<LinkedInOAuthToken> {
    const payload = await this.request(
      OAUTH_BROKER_GRANT_REDEMPTION_PATH,
      {
        provider: LINKEDIN_OAUTH_BROKER_PROVIDER_ID,
        grant: configured(grant, "OAuth broker grant"),
      },
      "grant redemption",
    );
    const parsed = oauthBrokerGrantRedemptionResponseSchema.safeParse(payload);
    if (
      !parsed.success ||
      parsed.data.provider !== LINKEDIN_OAUTH_BROKER_PROVIDER_ID
    ) {
      throw new Error(
        "LinkedIn OAuth broker returned an invalid grant response",
      );
    }
    return validateLinkedInOAuthToken(parsed.data.credential);
  }

  private async request(
    path: string,
    body: Record<string, string>,
    operation: string,
  ): Promise<unknown> {
    const response = await this.fetchFn(new URL(path, this.baseUrl), {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: this.authorization,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await responseJson(response, operation);
    if (!response.ok) {
      throw new Error(
        `LinkedIn OAuth broker ${operation} failed (${response.status})`,
      );
    }
    return payload;
  }
}
