import { randomBytes } from "node:crypto";
import { z } from "@brains/utils/zod";
import type { LinkedInFetch } from "./linkedin-client";

const AUTHORIZATION_URL = "https://www.linkedin.com/oauth/v2/authorization";
const ACCESS_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
export const PORTABILITY_SCOPE = "r_dma_portability_3rd_party";
const MAX_ERROR_LENGTH = 500;

export interface LinkedInOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface LinkedInToken {
  accessToken: string;
  expiresAt: string;
}

const tokenResponseSchema = z.looseObject({
  access_token: z.string().min(1),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
});

const errorResponseSchema = z.looseObject({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

async function json(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    // LinkedIn answered without JSON; the status alone explains the failure.
    return null;
  }
}

/** LinkedIn's server-side authorization-code flow for the portability scope. */
export class LinkedInOAuthClient {
  private readonly config: LinkedInOAuthConfig;
  private readonly fetchFn: LinkedInFetch;

  constructor(
    config: LinkedInOAuthConfig,
    fetchFn: LinkedInFetch = globalThis.fetch,
  ) {
    this.config = config;
    this.fetchFn = fetchFn;
  }

  authorizationUrl(state: string): URL {
    const url = new URL(AUTHORIZATION_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.config.clientId);
    url.searchParams.set("redirect_uri", this.config.redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("scope", PORTABILITY_SCOPE);
    return url;
  }

  /** Exchanges an authorization code; `now` dates the token's expiry. */
  async exchange(code: string, now: number): Promise<LinkedInToken> {
    const response = await this.fetchFn(ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
      }).toString(),
    });
    const payload = await json(response);
    if (!response.ok) {
      const refusal = errorResponseSchema.safeParse(payload);
      const detail = refusal.success
        ? [refusal.data.error, refusal.data.error_description]
            .filter(Boolean)
            .join(": ")
        : "";
      throw new Error(
        `LinkedIn refused the code (${response.status})${detail ? `: ${detail.slice(0, MAX_ERROR_LENGTH)}` : ""}`,
      );
    }
    const token = tokenResponseSchema.parse(payload);
    if (token.scope !== undefined && token.scope !== PORTABILITY_SCOPE) {
      throw new Error("LinkedIn granted a token without the portability scope");
    }
    return {
      accessToken: token.access_token,
      expiresAt: new Date(now + token.expires_in * 1000).toISOString(),
    };
  }
}

const STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING = 20;

interface PendingState {
  userId: string;
  expiresAt: number;
}

/**
 * Process-local, single-use OAuth state bound to the account that started the
 * connection. A restart drops a connection in flight; the owner starts again.
 */
export class OAuthStateStore {
  private readonly pending = new Map<string, PendingState>();
  private readonly now: () => number;

  constructor(options: { now?: () => number } = {}) {
    this.now = options.now ?? Date.now;
  }

  issue(userId: string): string {
    this.prune();
    [...this.pending.keys()]
      .slice(0, Math.max(0, this.pending.size - MAX_PENDING + 1))
      .forEach((oldest) => this.pending.delete(oldest));
    const state = randomBytes(32).toString("base64url");
    this.pending.set(state, { userId, expiresAt: this.now() + STATE_TTL_MS });
    return state;
  }

  /** The account the state was issued for, once; null for anything else. */
  consume(state: string): string | null {
    this.prune();
    const pending = this.pending.get(state);
    this.pending.delete(state);
    return pending?.userId ?? null;
  }

  private prune(): void {
    const now = this.now();
    [...this.pending]
      .filter(([, pending]) => pending.expiresAt <= now)
      .forEach(([state]) => this.pending.delete(state));
  }
}
