import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import {
  InvalidGrantError,
  type AuthorizationCodePersistence,
} from "./auth-code-store";
import {
  InvalidClientMetadataError,
  type OAuthClientPersistence,
} from "./client-store";
import {
  InvalidRefreshTokenError,
  type RefreshTokenPersistence,
} from "./refresh-token-store";
import type { AuthKeyStore } from "./key-store";
import type { AuthSessionRecord } from "./session-store";
import { signJwt } from "./jwt";
import { hasMatchingRedirectUri } from "./redirect-uri";
import {
  jsonResponse,
  oauthErrorResponse,
  parseClientAuth,
  parseRequestBody,
  stringEntries,
} from "./http-responses";
import { htmlResponse } from "./http-responses";
import { renderAuthorizePage, unauthorizedHtmlResponse } from "./pages";
import type { ValidAuthorizationRequest } from "./types";

const AUTHORIZATION_APPROVAL_TOKEN_TTL_SECONDS = 10 * 60;
const CLIENT_REGISTRATION_RATE_LIMIT = 30;
const CLIENT_REGISTRATION_GLOBAL_RATE_LIMIT = 300;
const CLIENT_REGISTRATION_RATE_WINDOW_SECONDS = 60;
const UNKNOWN_CLIENT_REGISTRATION_SOURCE = "unknown";
const UNCONSENTED_CLIENT_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const DEFAULT_CLIENT_PRUNE_INTERVAL_MS = 60 * 60 * 1000;

interface AuthorizationApprovalTokenState {
  token: string;
  sessionId: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope?: string;
  state?: string;
  expiresAt: number;
}

export interface OAuthEndpointsOptions {
  clientStore: OAuthClientPersistence;
  authCodeStore: AuthorizationCodePersistence;
  refreshTokenStore: RefreshTokenPersistence;
  resolveSession: (request: Request) => Promise<AuthSessionRecord | undefined>;
  keyStore: AuthKeyStore;
  clientMaintenanceIntervalMs?: number;
  onClientMaintenanceError?: (error: unknown) => void;
}

function clientRegistrationSource(request: Request): string {
  // Hosted brains run behind a proxy that canonicalizes these headers. Direct
  // requests without one share a conservative fallback bucket.
  for (const header of ["cf-connecting-ip", "x-forwarded-for", "x-real-ip"]) {
    const value = request.headers.get(header);
    if (!value) continue;
    for (const candidate of value.split(",")) {
      const address = candidate.trim();
      if (isIP(address) !== 0) return address.toLowerCase();
    }
  }
  return UNKNOWN_CLIENT_REGISTRATION_SOURCE;
}

/**
 * OAuth HTTP endpoints: the authorize page and its one-shot approval
 * tokens, dynamic client registration, the token endpoint
 * (authorization-code and refresh grants), and revocation.
 */
export class OAuthEndpoints {
  private readonly clientStore: OAuthClientPersistence;
  private readonly authCodeStore: AuthorizationCodePersistence;
  private readonly refreshTokenStore: RefreshTokenPersistence;
  private readonly resolveSession: (
    request: Request,
  ) => Promise<AuthSessionRecord | undefined>;
  private readonly keyStore: AuthKeyStore;
  private readonly clientMaintenanceIntervalMs: number;
  private readonly onClientMaintenanceError: (error: unknown) => void;
  private readonly authorizationApprovalTokens = new Map<
    string,
    AuthorizationApprovalTokenState
  >();
  private readonly clientRegistrationAttempts = new Map<string, number[]>();
  private globalClientRegistrationAttempts: number[] = [];
  private clientMaintenanceTimer: ReturnType<typeof setInterval> | undefined;

  constructor(options: OAuthEndpointsOptions) {
    this.clientStore = options.clientStore;
    this.authCodeStore = options.authCodeStore;
    this.refreshTokenStore = options.refreshTokenStore;
    this.resolveSession = options.resolveSession;
    this.keyStore = options.keyStore;
    this.clientMaintenanceIntervalMs =
      options.clientMaintenanceIntervalMs !== undefined &&
      Number.isFinite(options.clientMaintenanceIntervalMs) &&
      options.clientMaintenanceIntervalMs > 0
        ? options.clientMaintenanceIntervalMs
        : DEFAULT_CLIENT_PRUNE_INTERVAL_MS;
    this.onClientMaintenanceError =
      options.onClientMaintenanceError ?? ((): void => undefined);
  }

  async handleAuthorizePage(request: Request): Promise<Response> {
    const session = await this.resolveSession(request);
    if (!session) {
      return unauthorizedHtmlResponse(request);
    }

    const validation = await this.validateAuthorizationRequest(
      new URL(request.url).searchParams,
    );
    if (!validation.success) {
      return new Response(validation.error, { status: 400 });
    }

    const approvalToken = this.createAuthorizationApprovalToken(
      session,
      validation.params,
    );
    return htmlResponse(renderAuthorizePage(validation.params, approvalToken));
  }

  async handleAuthorizeApproval(request: Request): Promise<Response> {
    const session = await this.resolveSession(request);
    if (!session) {
      return unauthorizedHtmlResponse(request);
    }

    const form = await request.formData();
    const validation = await this.validateAuthorizationRequest(
      new URLSearchParams(stringEntries(form)),
    );
    if (!validation.success) {
      return new Response(validation.error, { status: 400 });
    }

    const rawApprovalToken = form.get("approval_token");
    const approvalToken =
      typeof rawApprovalToken === "string" ? rawApprovalToken : undefined;
    if (
      !approvalToken ||
      !this.consumeAuthorizationApprovalToken(
        approvalToken,
        session,
        validation.params,
      )
    ) {
      return new Response("Invalid authorization approval token", {
        status: 400,
      });
    }

    const code = await this.authCodeStore.createCode({
      clientId: validation.params.clientId,
      redirectUri: validation.params.redirectUri,
      codeChallenge: validation.params.codeChallenge,
      ...(validation.params.scope ? { scope: validation.params.scope } : {}),
      subject: session.subject,
    });

    const redirect = new URL(validation.params.redirectUri);
    redirect.searchParams.set("code", code.code);
    if (validation.params.state) {
      redirect.searchParams.set("state", validation.params.state);
    }

    return Response.redirect(redirect.toString(), 302);
  }

  private createAuthorizationApprovalToken(
    session: AuthSessionRecord,
    params: ValidAuthorizationRequest,
  ): string {
    this.pruneExpiredAuthorizationApprovalTokens();
    const token = `oat_${randomUUID()}`;
    this.authorizationApprovalTokens.set(token, {
      token,
      sessionId: session.id,
      clientId: params.clientId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      ...(params.scope ? { scope: params.scope } : {}),
      ...(params.state ? { state: params.state } : {}),
      expiresAt:
        Math.floor(Date.now() / 1000) +
        AUTHORIZATION_APPROVAL_TOKEN_TTL_SECONDS,
    });
    return token;
  }

  private consumeAuthorizationApprovalToken(
    token: string,
    session: AuthSessionRecord,
    params: ValidAuthorizationRequest,
  ): boolean {
    this.pruneExpiredAuthorizationApprovalTokens();
    const stored = this.authorizationApprovalTokens.get(token);
    if (!stored) return false;

    this.authorizationApprovalTokens.delete(token);
    return (
      stored.sessionId === session.id &&
      stored.clientId === params.clientId &&
      stored.redirectUri === params.redirectUri &&
      stored.codeChallenge === params.codeChallenge &&
      stored.scope === params.scope &&
      stored.state === params.state
    );
  }

  private pruneExpiredAuthorizationApprovalTokens(): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [token, stored] of this.authorizationApprovalTokens.entries()) {
      if (stored.expiresAt <= now) {
        this.authorizationApprovalTokens.delete(token);
      }
    }
  }

  private async validateAuthorizationRequest(params: URLSearchParams): Promise<
    | {
        success: true;
        params: ValidAuthorizationRequest;
      }
    | { success: false; error: string }
  > {
    const responseType = params.get("response_type");
    const clientId = params.get("client_id");
    const redirectUri = params.get("redirect_uri");
    const codeChallenge = params.get("code_challenge");
    const codeChallengeMethod = params.get("code_challenge_method");
    const requestedScope = params.get("scope") ?? undefined;
    const state = params.get("state") ?? undefined;

    if (responseType !== "code") {
      return { success: false, error: "Unsupported response_type" };
    }
    if (!clientId) {
      return { success: false, error: "Missing client_id" };
    }
    if (!redirectUri) {
      return { success: false, error: "Missing redirect_uri" };
    }
    if (!codeChallenge) {
      return { success: false, error: "Missing code_challenge" };
    }
    if (codeChallengeMethod !== "S256") {
      return { success: false, error: "Unsupported code_challenge_method" };
    }

    const client = await this.clientStore.getClient(clientId);
    if (!client) {
      return { success: false, error: "Unknown client_id" };
    }
    if (!hasMatchingRedirectUri(client.redirect_uris, redirectUri)) {
      return { success: false, error: "Unregistered redirect_uri" };
    }

    const scope = requestedScope ?? client.scope;

    return {
      success: true,
      params: {
        clientId,
        redirectUri,
        codeChallenge,
        ...(scope ? { scope } : {}),
        ...(state ? { state } : {}),
        clientName: client.client_name ?? client.client_id,
      },
    };
  }

  async handleClientRegistration(request: Request): Promise<Response> {
    if (!this.consumeClientRegistrationAttempt(request)) {
      return jsonResponse(
        {
          error: "temporarily_unavailable",
          error_description: "Client registration rate limit exceeded",
        },
        429,
        { "Retry-After": String(CLIENT_REGISTRATION_RATE_WINDOW_SECONDS) },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return oauthErrorResponse(
        "invalid_client_metadata",
        "Request body must be JSON",
      );
    }

    try {
      const client = await this.clientStore.registerClient(body);
      return jsonResponse(client, 201);
    } catch (error) {
      if (error instanceof InvalidClientMetadataError) {
        return oauthErrorResponse("invalid_client_metadata", error.message);
      }
      throw error;
    }
  }

  private consumeClientRegistrationAttempt(request: Request): boolean {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - CLIENT_REGISTRATION_RATE_WINDOW_SECONDS;
    this.globalClientRegistrationAttempts =
      this.globalClientRegistrationAttempts.filter(
        (attemptedAt) => attemptedAt > windowStart,
      );
    if (
      this.globalClientRegistrationAttempts.length >=
      CLIENT_REGISTRATION_GLOBAL_RATE_LIMIT
    ) {
      return false;
    }

    for (const [source, attempts] of this.clientRegistrationAttempts) {
      const activeAttempts = attempts.filter(
        (attemptedAt) => attemptedAt > windowStart,
      );
      if (activeAttempts.length === 0) {
        this.clientRegistrationAttempts.delete(source);
      } else if (activeAttempts.length !== attempts.length) {
        this.clientRegistrationAttempts.set(source, activeAttempts);
      }
    }

    const source = clientRegistrationSource(request);
    const attempts = this.clientRegistrationAttempts.get(source) ?? [];
    if (attempts.length >= CLIENT_REGISTRATION_RATE_LIMIT) {
      return false;
    }

    attempts.push(now);
    this.clientRegistrationAttempts.set(source, attempts);
    this.globalClientRegistrationAttempts.push(now);
    return true;
  }

  async startClientMaintenance(): Promise<void> {
    if (this.clientMaintenanceTimer) return;
    await this.runClientMaintenance();
    if (!this.clientStore.pruneStaleUnconsentedClients) return;

    this.clientMaintenanceTimer = setInterval(() => {
      void this.runClientMaintenance();
    }, this.clientMaintenanceIntervalMs);
    this.clientMaintenanceTimer.unref();
  }

  stopClientMaintenance(): void {
    if (!this.clientMaintenanceTimer) return;
    clearInterval(this.clientMaintenanceTimer);
    this.clientMaintenanceTimer = undefined;
  }

  private async runClientMaintenance(): Promise<void> {
    try {
      await this.clientStore.pruneStaleUnconsentedClients?.(
        Math.floor(Date.now() / 1000) - UNCONSENTED_CLIENT_RETENTION_SECONDS,
      );
    } catch (error) {
      this.onClientMaintenanceError(error);
    }
  }

  async handleTokenRequest(
    request: Request,
    issuer: string,
  ): Promise<Response> {
    const body = await parseRequestBody(request);
    const grantType = body.get("grant_type");
    const clientAuth = parseClientAuth(request, body);
    const clientId = clientAuth.clientId ?? body.get("client_id");

    if (clientAuth.error) {
      return oauthErrorResponse("invalid_client", clientAuth.error);
    }
    if (!clientId) {
      return oauthErrorResponse("invalid_request", "client_id is required");
    }

    const clientError = await this.clientStore.validateClientCredentials(
      clientId,
      clientAuth.clientSecret,
    );
    if (clientError) {
      return oauthErrorResponse("invalid_client", clientError);
    }

    if (grantType === "authorization_code") {
      return this.handleAuthorizationCodeGrant(body, clientId, issuer);
    }

    if (grantType === "refresh_token") {
      return this.handleRefreshTokenGrant(body, clientId, issuer);
    }

    return oauthErrorResponse(
      "unsupported_grant_type",
      "Only authorization_code and refresh_token are supported",
    );
  }

  private async handleAuthorizationCodeGrant(
    body: URLSearchParams,
    clientId: string,
    issuer: string,
  ): Promise<Response> {
    const code = body.get("code");
    const redirectUri = body.get("redirect_uri");
    const codeVerifier = body.get("code_verifier");

    if (!code || !redirectUri || !codeVerifier) {
      return oauthErrorResponse(
        "invalid_request",
        "code, redirect_uri, and code_verifier are required",
      );
    }

    const client = await this.clientStore.getClient(clientId);
    if (!client || !hasMatchingRedirectUri(client.redirect_uris, redirectUri)) {
      return oauthErrorResponse("invalid_grant", "Unregistered redirect_uri");
    }

    try {
      const consumed = await this.authCodeStore.consumeCode({
        code,
        clientId,
        redirectUri,
        codeVerifier,
      });
      return await this.createTokenResponse({
        issuer,
        clientId,
        subject: consumed.subject,
        ...(consumed.scope ? { scope: consumed.scope } : {}),
      });
    } catch (error) {
      if (error instanceof InvalidGrantError) {
        return oauthErrorResponse("invalid_grant", error.message);
      }
      throw error;
    }
  }

  private async handleRefreshTokenGrant(
    body: URLSearchParams,
    clientId: string,
    issuer: string,
  ): Promise<Response> {
    const refreshToken = body.get("refresh_token");
    if (!refreshToken) {
      return oauthErrorResponse("invalid_request", "refresh_token is required");
    }

    try {
      const rotated = await this.refreshTokenStore.rotateToken(
        refreshToken,
        clientId,
      );
      return await this.createTokenResponse({
        issuer,
        clientId,
        subject: rotated.consumed.subject,
        ...(rotated.consumed.scope ? { scope: rotated.consumed.scope } : {}),
        refreshToken: rotated.replacement.token,
      });
    } catch (error) {
      if (error instanceof InvalidRefreshTokenError) {
        return oauthErrorResponse("invalid_grant", error.message);
      }
      throw error;
    }
  }

  private async createTokenResponse(options: {
    issuer: string;
    clientId: string;
    subject: string;
    scope?: string;
    refreshToken?: string;
  }): Promise<Response> {
    const issuedAt = Math.floor(Date.now() / 1000);
    const expiresIn = 15 * 60;
    const accessToken = await signJwt(await this.keyStore.getPrivateJwk(), {
      iss: options.issuer,
      sub: options.subject,
      aud: options.clientId,
      iat: issuedAt,
      exp: issuedAt + expiresIn,
      ...(options.scope ? { scope: options.scope } : {}),
    });
    const refreshToken =
      options.refreshToken ??
      (
        await this.refreshTokenStore.issueToken({
          clientId: options.clientId,
          subject: options.subject,
          ...(options.scope ? { scope: options.scope } : {}),
        })
      ).token;

    return jsonResponse({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresIn,
      ...(options.scope ? { scope: options.scope } : {}),
      refresh_token: refreshToken,
    });
  }

  async handleRevokeRequest(request: Request): Promise<Response> {
    const body = await parseRequestBody(request);
    const clientAuth = parseClientAuth(request, body);
    const clientId = clientAuth.clientId ?? body.get("client_id") ?? undefined;
    const token = body.get("token");

    if (clientAuth.error) {
      return oauthErrorResponse("invalid_client", clientAuth.error);
    }
    if (!token) {
      return oauthErrorResponse("invalid_request", "token is required");
    }
    if (!clientId) {
      return oauthErrorResponse("invalid_request", "client_id is required");
    }

    const clientError = await this.clientStore.validateClientCredentials(
      clientId,
      clientAuth.clientSecret,
    );
    if (clientError) {
      return oauthErrorResponse("invalid_client", clientError);
    }

    await this.refreshTokenStore.revokeToken(token, clientId);
    return new Response(null, { status: 200 });
  }
}
