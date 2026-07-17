import { z } from "@brains/utils/zod";
import type {
  LinkedInAccessTokenProvider,
  LinkedInFetch,
} from "./linkedin-client";

export const LINKEDIN_AUTHORIZATION_URL =
  "https://www.linkedin.com/oauth/v2/authorization";
export const LINKEDIN_ACCESS_TOKEN_URL =
  "https://www.linkedin.com/oauth/v2/accessToken";
export const LINKEDIN_PORTABILITY_SCOPE = "r_dma_portability_3rd_party";

const MAX_OAUTH_ERROR_LENGTH = 500;

const tokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
  token_type: z.string().optional(),
});

const errorResponseSchema = z.looseObject({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export interface LinkedInOAuthToken {
  accessToken: string;
  expiresIn: number;
  scope?: string | undefined;
  tokenType?: string | undefined;
}

export interface LinkedInOAuthTokenStore extends LinkedInAccessTokenProvider {
  storeToken(token: LinkedInOAuthToken): Promise<void>;
  clearToken(): Promise<void>;
}

export interface LinkedInAuthorizationRequest {
  redirectUri: string;
  state: string;
}

export interface LinkedInCodeExchangeRequest {
  code: string;
  redirectUri: string;
}

function configured(value: string, name: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${name} must not be empty`);
  return trimmed;
}

function validatedRedirectUri(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("LinkedIn OAuth redirect URI must use HTTP or HTTPS");
  }
  return url.toString();
}

function boundedError(value: string): string {
  return value.slice(0, MAX_OAUTH_ERROR_LENGTH);
}

/** LinkedIn's documented server-side authorization-code protocol. */
export class LinkedInOAuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchFn: LinkedInFetch;

  constructor(
    clientId: string,
    clientSecret: string,
    fetchFn: LinkedInFetch = globalThis.fetch,
  ) {
    this.clientId = configured(clientId, "LinkedIn OAuth client ID");
    this.clientSecret = configured(
      clientSecret,
      "LinkedIn OAuth client secret",
    );
    this.fetchFn = fetchFn;
  }

  createAuthorizationUrl(request: LinkedInAuthorizationRequest): URL {
    const state = configured(request.state, "LinkedIn OAuth state");
    const url = new URL(LINKEDIN_AUTHORIZATION_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId);
    url.searchParams.set(
      "redirect_uri",
      validatedRedirectUri(request.redirectUri),
    );
    url.searchParams.set("state", state);
    url.searchParams.set("scope", LINKEDIN_PORTABILITY_SCOPE);
    return url;
  }

  async exchangeCode(
    request: LinkedInCodeExchangeRequest,
  ): Promise<LinkedInOAuthToken> {
    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: configured(request.code, "LinkedIn OAuth authorization code"),
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: validatedRedirectUri(request.redirectUri),
    });
    const response = await this.fetchFn(LINKEDIN_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error(
        `LinkedIn OAuth token exchange returned invalid JSON (${response.status})`,
      );
    }

    if (!response.ok) {
      const parsedError = errorResponseSchema.safeParse(payload);
      const detail = parsedError.success
        ? [parsedError.data.error, parsedError.data.error_description]
            .filter((value): value is string => Boolean(value))
            .join(": ")
        : "";
      throw new Error(
        `LinkedIn OAuth token exchange failed (${response.status})${detail ? `: ${boundedError(detail)}` : ""}`,
      );
    }

    const parsed = tokenResponseSchema.safeParse(payload);
    if (!parsed.success) {
      throw new Error("LinkedIn OAuth token response omitted required fields");
    }

    return {
      accessToken: parsed.data.access_token,
      expiresIn: parsed.data.expires_in,
      ...(parsed.data.scope ? { scope: parsed.data.scope } : {}),
      ...(parsed.data.token_type ? { tokenType: parsed.data.token_type } : {}),
    };
  }
}
