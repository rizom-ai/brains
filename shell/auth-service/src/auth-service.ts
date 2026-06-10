import type { Logger } from "@brains/utils";
import { AuthorizationCodeStore } from "./auth-code-store";
import { OAuthClientStore } from "./client-store";
import { AuthKeyStore } from "./key-store";
import { PasskeyService } from "./passkey-service";
import { RefreshTokenStore } from "./refresh-token-store";
import { SetupStateStore } from "./setup-state-store";
import {
  clearOperatorSessionCookie,
  OperatorSessionStore,
  type CreateOperatorSessionResult,
  type OperatorSessionRecord,
} from "./session-store";
import {
  absoluteUrl,
  issuerFromRequest,
  isLoopbackIssuer,
  isSecureRequest,
  normalizeIssuer,
} from "./issuer";
import {
  getBearerToken,
  verifyAccessToken,
  type VerifiedAccessToken,
} from "./token-verifier";
import {
  corsPreflightResponse,
  htmlResponse,
  isCorsMachineEndpoint,
  jsonResponse,
  safeRelativeReturnTo,
  withCors,
} from "./http-responses";
import { renderLoginPage, unauthorizedHtmlResponse } from "./pages";
import { OAuthEndpoints } from "./oauth-endpoints";
import { WebAuthnEndpoints } from "./webauthn-endpoints";
import { SetupFlow, type OperatorSetupRequired } from "./setup-flow";
import type {
  AuthorizationServerMetadata,
  JwksResponse,
  ProtectedResourceMetadata,
  RegisteredOAuthClient,
} from "./types";

export type { OperatorSetupRequired } from "./setup-flow";

export interface AuthServiceOptions {
  /** Runtime auth storage directory. Must not be the content/brain-data directory. */
  storageDir: string;
  /** Public issuer origin, for example https://brain.example.com. */
  issuer?: string;
  /** Additional trusted issuer origins, for example a preview host. */
  trustedIssuers?: string[];
  /** Allow localhost/127.0.0.1 request issuers. Defaults to true only for localhost issuers. */
  allowLocalhostIssuers?: boolean;
  logger?: Logger;
}

export class AuthService {
  private readonly issuer: string;
  private readonly trustedIssuers: Set<string>;
  private readonly allowLocalhostIssuers: boolean;
  private readonly keyStore: AuthKeyStore;
  private readonly clientStore: OAuthClientStore;
  private readonly authCodeStore: AuthorizationCodeStore;
  private readonly sessionStore: OperatorSessionStore;
  private readonly passkeyService: PasskeyService;
  private readonly setupFlow: SetupFlow;
  private readonly oauthEndpoints: OAuthEndpoints;
  private readonly webauthnEndpoints: WebAuthnEndpoints;
  private readonly logger: Logger | undefined;

  constructor(options: AuthServiceOptions) {
    this.issuer = normalizeIssuer(options.issuer);
    this.trustedIssuers = new Set([
      this.issuer,
      ...(options.trustedIssuers ?? []).map((issuer) =>
        normalizeIssuer(issuer),
      ),
    ]);
    this.allowLocalhostIssuers =
      options.allowLocalhostIssuers ?? isLoopbackIssuer(this.issuer);
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
    this.setupFlow = new SetupFlow({
      setupStateStore: new SetupStateStore({ storageDir: options.storageDir }),
      passkeyService: this.passkeyService,
    });
    this.oauthEndpoints = new OAuthEndpoints({
      clientStore: this.clientStore,
      authCodeStore: this.authCodeStore,
      refreshTokenStore: new RefreshTokenStore({
        storageDir: options.storageDir,
      }),
      sessionStore: this.sessionStore,
      keyStore: this.keyStore,
    });
    this.webauthnEndpoints = new WebAuthnEndpoints({
      passkeyService: this.passkeyService,
      sessionStore: this.sessionStore,
      setupFlow: this.setupFlow,
    });
    this.logger = options.logger;
  }

  getIssuer(): string {
    return this.issuer;
  }

  async initialize(): Promise<void> {
    await this.keyStore.getPrivateJwk();
    this.logger?.debug("Auth service signing key loaded");

    if (!(await this.hasPasskeyCredentials())) {
      await this.setupFlow.ensureSetupToken();
      const setupUrl = this.getSetupUrl();
      if (setupUrl) {
        if (isLoopbackIssuer(this.issuer)) {
          this.logger?.warn(`Passkey setup required: ${setupUrl}`);
        } else {
          this.logger?.warn(
            "Passkey setup required. Ask through an anchor-visible interface for the setup URL.",
          );
        }
      }
    }
  }

  async hasPasskeyCredentials(): Promise<boolean> {
    return this.passkeyService.hasCredentials();
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
      scopes_supported: ["mcp"],
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
    options: { secure?: boolean } = {},
  ): Promise<CreateOperatorSessionResult> {
    return this.sessionStore.createSession(subject, options);
  }

  async getOperatorSession(
    request: Request,
  ): Promise<OperatorSessionRecord | undefined> {
    return this.sessionStore.getSessionFromRequest(request);
  }

  createOperatorLoginResponse(request: Request): Response {
    return unauthorizedHtmlResponse(request);
  }

  async verifyBearerToken(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<VerifiedAccessToken | undefined> {
    const token = getBearerToken(request);
    if (!token) return undefined;

    const issuer = options.issuer
      ? normalizeIssuer(options.issuer)
      : this.resolveRequestIssuer(request);

    return verifyAccessToken(token, await this.getJwks(), {
      issuer,
      ...(options.audience ? { audience: options.audience } : {}),
    });
  }

  getSetupUrl(issuer = this.issuer): string | undefined {
    return this.setupFlow.getSetupUrl(issuer);
  }

  async getOperatorSetupRequired(
    issuer = this.issuer,
  ): Promise<OperatorSetupRequired | undefined> {
    return this.setupFlow.getOperatorSetupRequired(issuer);
  }

  async hasSetupEmailDelivery(
    setupTokenIdValue: string,
    recipient: string,
  ): Promise<boolean> {
    return this.setupFlow.hasSetupEmailDelivery(setupTokenIdValue, recipient);
  }

  async recordSetupEmailDelivery(
    setupTokenIdValue: string,
    recipient: string,
    options: { deliveryId?: string } = {},
  ): Promise<void> {
    await this.setupFlow.recordSetupEmailDelivery(
      setupTokenIdValue,
      recipient,
      options,
    );
  }

  async handleRequest(request: Request): Promise<Response> {
    let requestIssuer: string;
    try {
      requestIssuer = this.resolveRequestIssuer(request);
    } catch (error) {
      this.logger?.warn("Rejected OAuth request from untrusted issuer", {
        error: error instanceof Error ? error.message : String(error),
      });
      return new Response("Untrusted OAuth issuer", { status: 400 });
    }
    const path = new URL(request.url).pathname;

    if (request.method === "OPTIONS" && isCorsMachineEndpoint(path)) {
      return corsPreflightResponse();
    }

    if (request.method === "GET") {
      if (path === "/.well-known/oauth-authorization-server") {
        return withCors(
          jsonResponse(this.getAuthorizationServerMetadata(requestIssuer)),
        );
      }

      if (path === "/.well-known/jwks.json") {
        return withCors(jsonResponse(await this.getJwks()));
      }

      if (path === "/.well-known/oauth-protected-resource") {
        return withCors(
          jsonResponse(
            this.getProtectedResourceMetadata(requestIssuer, requestIssuer),
          ),
        );
      }
    }

    if (request.method === "GET" && path === "/setup") {
      return this.setupFlow.handleSetupPage(request);
    }

    if (request.method === "GET" && path === "/login") {
      return this.handleLoginPage(request);
    }

    if (
      (request.method === "GET" || request.method === "POST") &&
      path === "/logout"
    ) {
      return this.handleLogout(request);
    }

    if (request.method === "POST" && path === "/webauthn/register/options") {
      return this.webauthnEndpoints.handleRegistrationOptions(request);
    }

    if (request.method === "POST" && path === "/webauthn/register/verify") {
      return this.webauthnEndpoints.handleRegistrationVerify(request);
    }

    if (request.method === "POST" && path === "/webauthn/auth/options") {
      return this.webauthnEndpoints.handleAuthenticationOptions(request);
    }

    if (request.method === "POST" && path === "/webauthn/auth/verify") {
      return this.webauthnEndpoints.handleAuthenticationVerify(request);
    }

    if (request.method === "GET" && path === "/authorize") {
      return this.oauthEndpoints.handleAuthorizePage(request);
    }

    if (request.method === "POST" && path === "/authorize") {
      return this.oauthEndpoints.handleAuthorizeApproval(request);
    }

    if (request.method === "POST" && path === "/register") {
      return withCors(
        await this.oauthEndpoints.handleClientRegistration(request),
      );
    }

    if (request.method === "POST" && path === "/token") {
      return withCors(
        await this.oauthEndpoints.handleTokenRequest(request, requestIssuer),
      );
    }

    if (request.method === "POST" && path === "/revoke") {
      return withCors(await this.oauthEndpoints.handleRevokeRequest(request));
    }

    return new Response("Not Found", { status: 404 });
  }

  async handleWellKnownRequest(request: Request): Promise<Response> {
    return this.handleRequest(request);
  }

  private resolveRequestIssuer(request: Request): string {
    const requestIssuer = issuerFromRequest(request, this.issuer);
    if (
      this.trustedIssuers.has(requestIssuer) ||
      (this.allowLocalhostIssuers && isLoopbackIssuer(requestIssuer))
    ) {
      return requestIssuer;
    }

    throw new Error(
      `Request issuer ${requestIssuer} is not in trusted issuers`,
    );
  }

  private handleLoginPage(request: Request): Response {
    const returnTo = safeRelativeReturnTo(
      new URL(request.url).searchParams.get("return_to"),
    );
    return htmlResponse(renderLoginPage(returnTo));
  }

  private async handleLogout(request: Request): Promise<Response> {
    await this.sessionStore.revokeSessionFromRequest(request);
    const returnTo = safeRelativeReturnTo(
      new URL(request.url).searchParams.get("return_to"),
    );
    return new Response(null, {
      status: 302,
      headers: {
        Location: returnTo,
        "Set-Cookie": clearOperatorSessionCookie(isSecureRequest(request)),
        "Cache-Control": "no-store",
      },
    });
  }
}
