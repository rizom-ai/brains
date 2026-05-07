import { randomUUID } from "node:crypto";
import type { Logger } from "@brains/utils";
import { AuthorizationCodeStore, InvalidGrantError } from "./auth-code-store";
import { InvalidClientMetadataError, OAuthClientStore } from "./client-store";
import { signJwt } from "./jwt";
import { AuthKeyStore } from "./key-store";
import {
  OperatorSessionStore,
  type CreateOperatorSessionResult,
} from "./session-store";
import { absoluteUrl, issuerFromRequest, normalizeIssuer } from "./issuer";
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

export class AuthService {
  private readonly issuer: string;
  private readonly keyStore: AuthKeyStore;
  private readonly clientStore: OAuthClientStore;
  private readonly authCodeStore: AuthorizationCodeStore;
  private readonly sessionStore: OperatorSessionStore;
  private readonly logger: Logger | undefined;

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
    this.logger = options.logger;
  }

  getIssuer(): string {
    return this.issuer;
  }

  async initialize(): Promise<void> {
    await this.keyStore.getPrivateJwk();
    this.logger?.debug("Auth service signing key loaded");
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

    return new Response("Not Found", { status: 404 });
  }

  async handleWellKnownRequest(request: Request): Promise<Response> {
    return this.handleRequest(request);
  }

  private async handleAuthorizePage(request: Request): Promise<Response> {
    const session = await this.sessionStore.getSessionFromRequest(request);
    if (!session) {
      return unauthorizedHtmlResponse();
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
      return unauthorizedHtmlResponse();
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

    if (grantType !== "authorization_code") {
      return oauthErrorResponse(
        "unsupported_grant_type",
        "Only authorization_code is supported",
      );
    }

    const clientAuth = parseClientAuth(request, body);
    const code = body.get("code");
    const clientId = clientAuth.clientId ?? body.get("client_id");
    const redirectUri = body.get("redirect_uri");
    const codeVerifier = body.get("code_verifier");

    if (clientAuth.error) {
      return oauthErrorResponse("invalid_client", clientAuth.error);
    }
    if (!code || !clientId || !redirectUri || !codeVerifier) {
      return oauthErrorResponse(
        "invalid_request",
        "code, client_id, redirect_uri, and code_verifier are required",
      );
    }

    const client = await this.clientStore.getClient(clientId);
    if (!client) {
      return oauthErrorResponse("invalid_client", "Unknown client_id");
    }
    if (
      client.client_secret &&
      client.client_secret !== clientAuth.clientSecret
    ) {
      return oauthErrorResponse("invalid_client", "Invalid client secret");
    }
    if (!client.redirect_uris.includes(redirectUri)) {
      return oauthErrorResponse("invalid_grant", "Unregistered redirect_uri");
    }

    try {
      const consumed = await this.authCodeStore.consumeCode({
        code,
        clientId,
        redirectUri,
        codeVerifier,
      });
      const issuedAt = Math.floor(Date.now() / 1000);
      const expiresIn = 15 * 60;
      const accessToken = await signJwt(await this.keyStore.getPrivateJwk(), {
        iss: issuer,
        sub: consumed.subject,
        aud: clientId,
        iat: issuedAt,
        exp: issuedAt + expiresIn,
        ...(consumed.scope ? { scope: consumed.scope } : {}),
      });

      return jsonResponse({
        access_token: accessToken,
        token_type: "Bearer",
        expires_in: expiresIn,
        ...(consumed.scope ? { scope: consumed.scope } : {}),
        refresh_token: `ort_${randomUUID()}`,
      });
    } catch (error) {
      if (error instanceof InvalidGrantError) {
        return oauthErrorResponse("invalid_grant", error.message);
      }
      throw error;
    }
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
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

function unauthorizedHtmlResponse(): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8" /><title>Login required</title></head><body><h1>Operator login required</h1><p>Passkey login is required before authorizing OAuth clients.</p></body></html>`,
    {
      status: 401,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    },
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
