import { randomUUID } from "node:crypto";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/server";
import type { Logger } from "@brains/utils";
import { AuthorizationCodeStore, InvalidGrantError } from "./auth-code-store";
import { InvalidClientMetadataError, OAuthClientStore } from "./client-store";
import { signJwt } from "./jwt";
import { AuthKeyStore } from "./key-store";
import { PasskeyService, type WebAuthnRequestContext } from "./passkey-service";
import {
  InvalidRefreshTokenError,
  RefreshTokenStore,
} from "./refresh-token-store";
import {
  OperatorSessionStore,
  type CreateOperatorSessionResult,
} from "./session-store";
import { absoluteUrl, issuerFromRequest, normalizeIssuer } from "./issuer";
import {
  getBearerToken,
  verifyAccessToken,
  type VerifiedAccessToken,
} from "./token-verifier";
import type {
  AuthorizationServerMetadata,
  JwksResponse,
  ProtectedResourceMetadata,
  RegisteredOAuthClient,
} from "./types";

export interface AuthServiceOptions {
  /** Runtime auth storage directory. Must not be the content/brain-data directory. */
  storageDir: string;
  /** Public issuer origin, for example https://brain.example.com. */
  issuer?: string;
  logger?: Logger;
}

interface SetupTokenState {
  token: string;
  expiresAt: number;
}

const SETUP_TOKEN_TTL_SECONDS = 30 * 60;

export class AuthService {
  private readonly issuer: string;
  private readonly keyStore: AuthKeyStore;
  private readonly clientStore: OAuthClientStore;
  private readonly authCodeStore: AuthorizationCodeStore;
  private readonly sessionStore: OperatorSessionStore;
  private readonly passkeyService: PasskeyService;
  private readonly refreshTokenStore: RefreshTokenStore;
  private readonly logger: Logger | undefined;
  private setupToken: SetupTokenState | undefined;

  constructor(options: AuthServiceOptions) {
    this.issuer = normalizeIssuer(options.issuer);
    this.keyStore = new AuthKeyStore({ storageDir: options.storageDir });
    this.clientStore = new OAuthClientStore({ storageDir: options.storageDir });
    this.authCodeStore = new AuthorizationCodeStore({
      storageDir: options.storageDir,
    });
    this.sessionStore = new OperatorSessionStore({
      storageDir: options.storageDir,
    });
    this.passkeyService = new PasskeyService({
      storageDir: options.storageDir,
      ...(options.logger ? { logger: options.logger } : {}),
    });
    this.refreshTokenStore = new RefreshTokenStore({
      storageDir: options.storageDir,
    });
    this.logger = options.logger;
  }

  getIssuer(): string {
    return this.issuer;
  }

  async initialize(): Promise<void> {
    await this.keyStore.getPrivateJwk();
    this.logger?.debug("Auth service signing key loaded");

    if (!(await this.passkeyService.hasCredentials())) {
      this.createSetupToken();
      const setupUrl = this.getSetupUrl();
      if (setupUrl) {
        this.logger?.warn(`Passkey setup required: ${setupUrl}`);
      }
    }
  }

  async getJwks(): Promise<JwksResponse> {
    return {
      keys: [await this.keyStore.getPublicJwk()],
    };
  }

  getAuthorizationServerMetadata(
    issuer = this.issuer,
  ): AuthorizationServerMetadata {
    const normalized = normalizeIssuer(issuer);
    return {
      issuer: normalized,
      authorization_endpoint: absoluteUrl(normalized, "/authorize"),
      token_endpoint: absoluteUrl(normalized, "/token"),
      registration_endpoint: absoluteUrl(normalized, "/register"),
      revocation_endpoint: absoluteUrl(normalized, "/revoke"),
      jwks_uri: absoluteUrl(normalized, "/.well-known/jwks.json"),
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: [
        "none",
        "client_secret_basic",
        "client_secret_post",
      ],
      scopes_supported: ["openid", "profile", "email", "offline_access", "mcp"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["ES256"],
    };
  }

  getProtectedResourceMetadata(
    resource: string,
    issuer = this.issuer,
  ): ProtectedResourceMetadata {
    return {
      resource,
      authorization_servers: [normalizeIssuer(issuer)],
      bearer_methods_supported: ["header"],
      resource_signing_alg_values_supported: ["ES256"],
    };
  }

  async registerClient(input: unknown): Promise<RegisteredOAuthClient> {
    return this.clientStore.registerClient(input);
  }

  async getRegisteredClient(
    clientId: string,
  ): Promise<RegisteredOAuthClient | undefined> {
    return this.clientStore.getClient(clientId);
  }

  async createOperatorSession(
    subject = "single-operator",
  ): Promise<CreateOperatorSessionResult> {
    return this.sessionStore.createSession(subject);
  }

  async verifyBearerToken(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<VerifiedAccessToken | undefined> {
    const token = getBearerToken(request);
    if (!token) return undefined;

    return verifyAccessToken(token, await this.getJwks(), {
      issuer: normalizeIssuer(options.issuer ?? this.issuer),
      ...(options.audience ? { audience: options.audience } : {}),
    });
  }

  getSetupUrl(issuer = this.issuer): string | undefined {
    const setupToken = this.getValidSetupToken();
    if (!setupToken) return undefined;
    return absoluteUrl(
      issuer,
      `/setup?token=${encodeURIComponent(setupToken.token)}`,
    );
  }

  async handleRequest(request: Request): Promise<Response> {
    const requestIssuer = issuerFromRequest(request, this.issuer);
    const path = new URL(request.url).pathname;

    if (request.method === "GET") {
      if (path === "/.well-known/oauth-authorization-server") {
        return jsonResponse(this.getAuthorizationServerMetadata(requestIssuer));
      }

      if (path === "/.well-known/jwks.json") {
        return jsonResponse(await this.getJwks());
      }

      if (path === "/.well-known/oauth-protected-resource") {
        return jsonResponse(
          this.getProtectedResourceMetadata(requestIssuer, requestIssuer),
        );
      }
    }

    if (request.method === "GET" && path === "/setup") {
      return this.handleSetupPage(request);
    }

    if (request.method === "GET" && path === "/login") {
      return this.handleLoginPage(request);
    }

    if (request.method === "POST" && path === "/webauthn/register/options") {
      return this.handleWebAuthnRegistrationOptions(request);
    }

    if (request.method === "POST" && path === "/webauthn/register/verify") {
      return this.handleWebAuthnRegistrationVerify(request);
    }

    if (request.method === "POST" && path === "/webauthn/auth/options") {
      return this.handleWebAuthnAuthenticationOptions(request);
    }

    if (request.method === "POST" && path === "/webauthn/auth/verify") {
      return this.handleWebAuthnAuthenticationVerify(request);
    }

    if (request.method === "GET" && path === "/authorize") {
      return this.handleAuthorizePage(request);
    }

    if (request.method === "POST" && path === "/authorize") {
      return this.handleAuthorizeApproval(request);
    }

    if (request.method === "POST" && path === "/register") {
      return this.handleClientRegistration(request);
    }

    if (request.method === "POST" && path === "/token") {
      return this.handleTokenRequest(request, requestIssuer);
    }

    if (request.method === "POST" && path === "/revoke") {
      return this.handleRevokeRequest(request);
    }

    return new Response("Not Found", { status: 404 });
  }

  async handleWellKnownRequest(request: Request): Promise<Response> {
    return this.handleRequest(request);
  }

  private async handleSetupPage(request: Request): Promise<Response> {
    if (await this.passkeyService.hasCredentials()) {
      return new Response("Setup already completed", { status: 404 });
    }
    if (!this.hasValidSetupToken(request)) {
      return new Response("Not Found", { status: 404 });
    }

    const token = new URL(request.url).searchParams.get("token") ?? "";
    return htmlResponse(renderSetupPage(token));
  }

  private handleLoginPage(request: Request): Response {
    const returnTo = new URL(request.url).searchParams.get("return_to") ?? "/";
    return htmlResponse(renderLoginPage(returnTo));
  }

  private async handleWebAuthnRegistrationOptions(
    request: Request,
  ): Promise<Response> {
    if (await this.passkeyService.hasCredentials()) {
      return oauthErrorResponse(
        "access_denied",
        "Passkey setup already completed",
      );
    }
    if (!this.hasValidSetupToken(request)) {
      return oauthErrorResponse("access_denied", "Invalid setup token");
    }

    const options = await this.passkeyService.generateRegistrationOptions(
      webAuthnRequestContext(request),
    );
    return jsonResponse(options);
  }

  private async handleWebAuthnRegistrationVerify(
    request: Request,
  ): Promise<Response> {
    if (await this.passkeyService.hasCredentials()) {
      return oauthErrorResponse(
        "access_denied",
        "Passkey setup already completed",
      );
    }
    if (!this.hasValidSetupToken(request)) {
      return oauthErrorResponse("access_denied", "Invalid setup token");
    }

    const result = await this.passkeyService.verifyRegistrationResponse(
      (await request.json()) as RegistrationResponseJSON,
      webAuthnRequestContext(request),
    );
    if (!result.verified) {
      return oauthErrorResponse("access_denied", "Passkey registration failed");
    }

    this.setupToken = undefined;
    const session = await this.createOperatorSession(result.subject);
    return jsonResponse({ verified: true }, 200, {
      "Set-Cookie": session.cookie,
    });
  }

  private createSetupToken(): void {
    this.setupToken = {
      token: `setup_${randomUUID()}`,
      expiresAt: Math.floor(Date.now() / 1000) + SETUP_TOKEN_TTL_SECONDS,
    };
  }

  private getValidSetupToken(): SetupTokenState | undefined {
    if (!this.setupToken) return undefined;
    if (this.setupToken.expiresAt <= Math.floor(Date.now() / 1000)) {
      this.setupToken = undefined;
      return undefined;
    }
    return this.setupToken;
  }

  private hasValidSetupToken(request: Request): boolean {
    const setupToken = this.getValidSetupToken();
    if (!setupToken) return false;
    const url = new URL(request.url);
    const suppliedToken =
      url.searchParams.get("setup_token") ?? url.searchParams.get("token");
    return suppliedToken === setupToken.token;
  }

  private async handleWebAuthnAuthenticationOptions(
    request: Request,
  ): Promise<Response> {
    if (!(await this.passkeyService.hasCredentials())) {
      return oauthErrorResponse("access_denied", "No passkey registered");
    }

    const options = await this.passkeyService.generateAuthenticationOptions(
      webAuthnRequestContext(request),
    );
    return jsonResponse(options);
  }

  private async handleWebAuthnAuthenticationVerify(
    request: Request,
  ): Promise<Response> {
    const result = await this.passkeyService.verifyAuthenticationResponse(
      (await request.json()) as AuthenticationResponseJSON,
      webAuthnRequestContext(request),
    );
    if (!result.verified) {
      return oauthErrorResponse(
        "access_denied",
        "Passkey authentication failed",
      );
    }

    const session = await this.createOperatorSession(result.subject);
    return jsonResponse({ verified: true }, 200, {
      "Set-Cookie": session.cookie,
    });
  }

  private async handleAuthorizePage(request: Request): Promise<Response> {
    const session = await this.sessionStore.getSessionFromRequest(request);
    if (!session) {
      return unauthorizedHtmlResponse(request);
    }

    const validation = await this.validateAuthorizationRequest(
      new URL(request.url).searchParams,
    );
    if (!validation.success) {
      return new Response(validation.error, { status: 400 });
    }

    return htmlResponse(renderAuthorizePage(validation.params));
  }

  private async handleAuthorizeApproval(request: Request): Promise<Response> {
    const session = await this.sessionStore.getSessionFromRequest(request);
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
    const scope = params.get("scope") ?? undefined;
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
    if (!client.redirect_uris.includes(redirectUri)) {
      return { success: false, error: "Unregistered redirect_uri" };
    }

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

  private async handleClientRegistration(request: Request): Promise<Response> {
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
      const client = await this.registerClient(body);
      return jsonResponse(client, 201);
    } catch (error) {
      if (error instanceof InvalidClientMetadataError) {
        return oauthErrorResponse("invalid_client_metadata", error.message);
      }
      throw error;
    }
  }

  private async handleTokenRequest(
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

    const client = await this.clientStore.getClient(clientId);
    const clientError = validateClientForTokenRequest(client, clientAuth);
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
    if (!client?.redirect_uris.includes(redirectUri)) {
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

  private async handleRevokeRequest(request: Request): Promise<Response> {
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

    if (clientId) {
      const client = await this.clientStore.getClient(clientId);
      const clientError = validateClientForTokenRequest(client, clientAuth);
      if (clientError) {
        return oauthErrorResponse("invalid_client", clientError);
      }
    }

    await this.refreshTokenStore.revokeToken(token, clientId);
    return new Response(null, { status: 200 });
  }
}

interface ValidAuthorizationRequest {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scope?: string;
  state?: string;
  clientName: string;
}

function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function oauthErrorResponse(error: string, description: string): Response {
  return jsonResponse(
    {
      error,
      error_description: description,
    },
    400,
  );
}

async function parseRequestBody(request: Request): Promise<URLSearchParams> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as Record<string, unknown>;
    return new URLSearchParams(
      Object.entries(body).flatMap(([key, value]) =>
        typeof value === "string" ? [[key, value]] : [],
      ),
    );
  }

  if (contentType.includes("form")) {
    return new URLSearchParams(stringEntries(await request.formData()));
  }

  return new URLSearchParams(await request.text());
}

function stringEntries(form: FormData): [string, string][] {
  return Array.from(form.entries()).flatMap(([key, value]) =>
    typeof value === "string" ? [[key, value]] : [],
  );
}

function validateClientForTokenRequest(
  client: RegisteredOAuthClient | undefined,
  clientAuth: { clientSecret?: string },
): string | undefined {
  if (!client) return "Unknown client_id";
  if (
    client.client_secret &&
    client.client_secret !== clientAuth.clientSecret
  ) {
    return "Invalid client secret";
  }
  return undefined;
}

function parseClientAuth(
  request: Request,
  body: URLSearchParams,
): { clientId?: string; clientSecret?: string; error?: string } {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    const clientId = body.get("client_id") ?? undefined;
    const clientSecret = body.get("client_secret") ?? undefined;
    return {
      ...(clientId ? { clientId } : {}),
      ...(clientSecret ? { clientSecret } : {}),
    };
  }

  if (!authHeader.startsWith("Basic ")) {
    return { error: "Unsupported client authentication method" };
  }

  try {
    const decoded = Buffer.from(
      authHeader.slice("Basic ".length),
      "base64",
    ).toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 0) {
      return { error: "Invalid Basic client authentication" };
    }

    const clientId = decodeURIComponent(decoded.slice(0, separator));
    const clientSecret = decodeURIComponent(decoded.slice(separator + 1));
    const bodyClientId = body.get("client_id");
    if (bodyClientId && bodyClientId !== clientId) {
      return { error: "Conflicting client_id values" };
    }
    return { clientId, clientSecret };
  } catch {
    return { error: "Invalid Basic client authentication" };
  }
}

function renderSetupPage(setupToken: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Set up passkey</title>
    ${authPageStyles()}
  </head>
  <body>
    <main class="card">
      <h1>Set up your brain passkey</h1>
      <p>Register a passkey to become the operator for this brain.</p>
      <button type="button" id="register">Register passkey</button>
      <p id="status" role="status"></p>
    </main>
    <script>${webauthnBrowserHelpers()}
    document.getElementById('register').addEventListener('click', async () => {
      const status = document.getElementById('status');
      try {
        status.textContent = 'Waiting for passkey...';
        const setupToken = ${JSON.stringify(setupToken)};
        const options = await fetchJSON('/webauthn/register/options?setup_token=' + encodeURIComponent(setupToken), { method: 'POST' });
        const credential = await navigator.credentials.create({ publicKey: prepareCreationOptions(options) });
        await fetchJSON('/webauthn/register/verify?setup_token=' + encodeURIComponent(setupToken), {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(credentialToJSON(credential)),
        });
        status.textContent = 'Passkey registered. You are logged in.';
        location.href = '/';
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    });</script>
  </body>
</html>`;
}

function renderLoginPage(returnTo: string, title = "Operator login"): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    ${authPageStyles()}
  </head>
  <body>
    <main class="card">
      <h1>${escapeHtml(title)}</h1>
      <p>Use your passkey to continue.</p>
      <button type="button" id="login">Continue with passkey</button>
      <p id="status" role="status"></p>
    </main>
    <script>${webauthnBrowserHelpers()}
    document.getElementById('login').addEventListener('click', async () => {
      const status = document.getElementById('status');
      try {
        status.textContent = 'Waiting for passkey...';
        const options = await fetchJSON('/webauthn/auth/options', { method: 'POST' });
        const credential = await navigator.credentials.get({ publicKey: prepareRequestOptions(options) });
        await fetchJSON('/webauthn/auth/verify', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(credentialToJSON(credential)),
        });
        location.href = ${JSON.stringify(returnTo)};
      } catch (error) {
        status.textContent = error instanceof Error ? error.message : String(error);
      }
    });</script>
  </body>
</html>`;
}

function authPageStyles(): string {
  return `<style>
      body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 1.5rem; box-shadow: 0 8px 30px rgb(0 0 0 / 8%); }
      button { border: 0; border-radius: 999px; padding: 0.75rem 1.2rem; font-weight: 700; background: #111; color: white; cursor: pointer; }
      code { overflow-wrap: anywhere; }
      [role='status'] { color: #555; }
    </style>`;
}

function webauthnBrowserHelpers(): string {
  return `
    function base64urlToBuffer(value) {
      const padded = value + '='.repeat((4 - value.length % 4) % 4);
      const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
      const binary = atob(base64);
      return Uint8Array.from(binary, c => c.charCodeAt(0));
    }
    function bufferToBase64url(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/g, '');
    }
    function prepareCreationOptions(options) {
      return {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        user: { ...options.user, id: base64urlToBuffer(options.user.id) },
        excludeCredentials: (options.excludeCredentials || []).map(credential => ({
          ...credential,
          id: base64urlToBuffer(credential.id),
        })),
      };
    }
    function prepareRequestOptions(options) {
      return {
        ...options,
        challenge: base64urlToBuffer(options.challenge),
        allowCredentials: (options.allowCredentials || []).map(credential => ({
          ...credential,
          id: base64urlToBuffer(credential.id),
        })),
      };
    }
    function credentialToJSON(credential) {
      const response = {};
      for (const key of Object.keys(credential.response)) {
        const value = credential.response[key];
        response[key] = value instanceof ArrayBuffer ? bufferToBase64url(value) : value;
      }
      if (typeof credential.response.getTransports === 'function') {
        response.transports = credential.response.getTransports();
      }
      return {
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response,
        clientExtensionResults: credential.getClientExtensionResults(),
        authenticatorAttachment: credential.authenticatorAttachment,
      };
    }
    async function fetchJSON(url, init) {
      const response = await fetch(url, init);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error_description || body.error || response.statusText);
      return body;
    }
  `;
}

function renderAuthorizePage(params: ValidAuthorizationRequest): string {
  const hidden = {
    response_type: "code",
    client_id: params.clientId,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    ...(params.scope ? { scope: params.scope } : {}),
    ...(params.state ? { state: params.state } : {}),
  };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Authorize ${escapeHtml(params.clientName)}</title>
    <style>
      body { font-family: system-ui, sans-serif; max-width: 36rem; margin: 4rem auto; padding: 0 1rem; line-height: 1.5; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 1.5rem; box-shadow: 0 8px 30px rgb(0 0 0 / 8%); }
      button { border: 0; border-radius: 999px; padding: 0.75rem 1.2rem; font-weight: 700; background: #111; color: white; cursor: pointer; }
      code { overflow-wrap: anywhere; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Authorize ${escapeHtml(params.clientName)}?</h1>
      <p>This temporary development screen will issue an OAuth authorization code for:</p>
      <p><code>${escapeHtml(params.redirectUri)}</code></p>
      <form method="post" action="/authorize">
        ${Object.entries(hidden)
          .map(
            ([name, value]) =>
              `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}" />`,
          )
          .join("\n        ")}
        <button type="submit">Approve</button>
      </form>
    </main>
  </body>
</html>`;
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function unauthorizedHtmlResponse(request: Request): Response {
  const returnTo = `${new URL(request.url).pathname}${new URL(request.url).search}`;
  return new Response(renderLoginPage(returnTo, "Operator login required"), {
    status: 401,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function webAuthnRequestContext(request: Request): WebAuthnRequestContext {
  const issuer = issuerFromRequest(request);
  const origin = new URL(issuer);
  return {
    origin: origin.origin,
    rpID: origin.hostname,
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
