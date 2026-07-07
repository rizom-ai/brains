import type { Logger } from "@brains/utils/logger";
import { AuthorizationCodeStore } from "./auth-code-store";
import { OAuthClientStore } from "./client-store";
import { AuthKeyStore } from "./key-store";
import {
  PasskeyService,
  type PasskeyRegistrationUser,
} from "./passkey-service";
import { AuthRuntimeDatabase } from "./runtime-db";
import type { AuthIdentity, AuthUser } from "./runtime-schema";
import {
  AuthUserStore,
  type AttachAuthIdentityInput,
  type CreateAuthUserInput,
  type ResolveAuthIdentityInput,
} from "./user-store";
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
import {
  DEFAULT_SETUP_TOKEN_TTL_SECONDS,
  SetupFlow,
  type OperatorSetupRequired,
} from "./setup-flow";
import type {
  AuthorizationServerMetadata,
  JwksResponse,
  ProtectedResourceMetadata,
  RegisteredOAuthClient,
} from "./types";

export type { OperatorSetupRequired } from "./setup-flow";

const MIGRATION_SINGLE_OPERATOR_SUBJECT = "single-operator";

export interface AuthPrincipal {
  userId: string;
  displayName: string;
  role: "anchor" | "trusted" | "public";
  status: "active" | "invited" | "suspended";
  permissionLevel: "anchor" | "trusted" | "public";
  canonicalId?: string;
}

export interface AuthServiceOptions {
  /** Runtime auth storage directory. Must not be the content/brain-data directory. */
  storageDir: string;
  /** Public issuer origin, for example https://brain.example.com. */
  issuer?: string;
  /** Additional trusted issuer origins, for example a preview host. */
  trustedIssuers?: string[];
  /** Allow localhost/127.0.0.1 request issuers. Defaults to true only for localhost issuers. */
  allowLocalhostIssuers?: boolean;
  /** First-passkey setup token lifetime in seconds. Defaults to 24 hours. */
  setupTokenTtlSeconds?: number;
  logger?: Logger;
}

export class AuthService {
  private readonly issuer: string;
  private readonly trustedIssuers: Set<string>;
  private readonly allowLocalhostIssuers: boolean;
  private readonly runtimeDatabase: AuthRuntimeDatabase;
  private userStore: AuthUserStore | undefined;
  private readonly keyStore: AuthKeyStore;
  private readonly clientStore: OAuthClientStore;
  private readonly authCodeStore: AuthorizationCodeStore;
  private readonly sessionStore: OperatorSessionStore;
  private readonly refreshTokenStore: RefreshTokenStore;
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
    this.runtimeDatabase = new AuthRuntimeDatabase({
      storageDir: options.storageDir,
    });
    this.keyStore = new AuthKeyStore({ storageDir: options.storageDir });
    this.clientStore = new OAuthClientStore({ storageDir: options.storageDir });
    this.authCodeStore = new AuthorizationCodeStore({
      storageDir: options.storageDir,
    });
    this.sessionStore = new OperatorSessionStore({
      storageDir: options.storageDir,
    });
    this.refreshTokenStore = new RefreshTokenStore({
      storageDir: options.storageDir,
    });
    this.passkeyService = new PasskeyService({
      storageDir: options.storageDir,
      ...(options.logger ? { logger: options.logger } : {}),
    });
    this.setupFlow = new SetupFlow({
      setupStateStore: new SetupStateStore({ storageDir: options.storageDir }),
      passkeyService: this.passkeyService,
      setupTokenTtlSeconds:
        options.setupTokenTtlSeconds ?? DEFAULT_SETUP_TOKEN_TTL_SECONDS,
    });
    this.oauthEndpoints = new OAuthEndpoints({
      clientStore: this.clientStore,
      authCodeStore: this.authCodeStore,
      refreshTokenStore: this.refreshTokenStore,
      sessionStore: this.sessionStore,
      keyStore: this.keyStore,
    });
    this.webauthnEndpoints = new WebAuthnEndpoints({
      passkeyService: this.passkeyService,
      sessionStore: this.sessionStore,
      setupFlow: this.setupFlow,
      registrationUserProvider: async (): Promise<PasskeyRegistrationUser> => {
        const user = await this.getUserStore().ensureFirstAnchorUser();
        return {
          subject: user.id,
          userName: user.displayName,
          userDisplayName: user.displayName,
        };
      },
    });
    this.logger = options.logger;
  }

  getIssuer(): string {
    return this.issuer;
  }

  async initialize(): Promise<void> {
    await this.ensureUserStoreStarted();
    await this.migrateLegacyPasskeys();
    await this.migrateLegacySessions();
    await this.migrateLegacyRefreshTokens();
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

  async close(): Promise<void> {
    this.userStore = undefined;
    await this.runtimeDatabase.stop();
  }

  private async ensureUserStoreStarted(): Promise<void> {
    if (this.userStore) {
      return;
    }
    await this.runtimeDatabase.start();
    this.userStore = new AuthUserStore(this.runtimeDatabase.db);
  }

  private async migrateLegacyPasskeys(): Promise<void> {
    const credentials = await this.passkeyService.listCredentials();
    if (
      !credentials.some(
        (credential) =>
          credential.subject === MIGRATION_SINGLE_OPERATOR_SUBJECT,
      )
    ) {
      return;
    }

    const user = await this.getUserStore().ensureFirstAnchorUser();
    const migrated = await this.passkeyService.rebindCredentialSubject(
      MIGRATION_SINGLE_OPERATOR_SUBJECT,
      user.id,
      user.displayName,
    );
    if (migrated > 0) {
      this.logger?.info("Migrated legacy operator passkey credentials", {
        migrated,
        userId: user.id,
      });
    }
  }

  private async migrateLegacySessions(): Promise<void> {
    const sessions = await this.sessionStore.listSessions();
    if (
      !sessions.some(
        (session) => session.subject === MIGRATION_SINGLE_OPERATOR_SUBJECT,
      )
    ) {
      return;
    }

    const user = await this.getUserStore().ensureFirstAnchorUser();
    const migrated = await this.sessionStore.rebindSessionSubject(
      MIGRATION_SINGLE_OPERATOR_SUBJECT,
      user.id,
    );
    if (migrated > 0) {
      this.logger?.info("Migrated legacy operator sessions", {
        migrated,
        userId: user.id,
      });
    }
  }

  private async migrateLegacyRefreshTokens(): Promise<void> {
    const revoked = await this.refreshTokenStore.revokeTokensForSubject(
      MIGRATION_SINGLE_OPERATOR_SUBJECT,
    );
    if (revoked > 0) {
      this.logger?.info("Revoked legacy operator refresh tokens", { revoked });
    }
  }

  private getUserStore(): AuthUserStore {
    if (!this.userStore) {
      throw new Error("Auth service has not been initialized");
    }
    return this.userStore;
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

  async createUser(input: CreateAuthUserInput): Promise<AuthPrincipal> {
    await this.ensureUserStoreStarted();
    return principalFromUser(await this.getUserStore().createUser(input));
  }

  async attachIdentity(input: AttachAuthIdentityInput): Promise<AuthIdentity> {
    await this.ensureUserStoreStarted();
    return this.getUserStore().attachIdentity(input);
  }

  async resolveIdentity(
    input: ResolveAuthIdentityInput,
  ): Promise<AuthPrincipal | undefined> {
    await this.ensureUserStoreStarted();
    const user = await this.getUserStore().resolveIdentity(input);
    return user ? principalFromUser(user) : undefined;
  }

  async createOperatorSession(
    subject?: string,
    options: { secure?: boolean } = {},
  ): Promise<CreateOperatorSessionResult> {
    await this.ensureUserStoreStarted();
    const sessionSubject =
      !subject || subject === MIGRATION_SINGLE_OPERATOR_SUBJECT
        ? (await this.getUserStore().ensureFirstAnchorUser()).id
        : subject;
    return this.sessionStore.createSession(sessionSubject, options);
  }

  async getOperatorSession(
    request: Request,
  ): Promise<OperatorSessionRecord | undefined> {
    return this.sessionStore.getSessionFromRequest(request);
  }

  async resolveSession(request: Request): Promise<AuthPrincipal | undefined> {
    await this.ensureUserStoreStarted();
    const session = await this.getOperatorSession(request);
    if (!session) {
      return undefined;
    }

    const user = await this.getUserStore().getUser(session.subject);
    if (user?.status !== "active") {
      return undefined;
    }
    return principalFromUser(user);
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

  async resolveBearerToken(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<AuthPrincipal | undefined> {
    await this.ensureUserStoreStarted();
    const verified = await this.verifyBearerToken(request, options);
    if (!verified) {
      return undefined;
    }

    const user = await this.getUserStore().getUser(verified.subject);
    if (user?.status !== "active") {
      return undefined;
    }
    return principalFromUser(user);
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

function principalFromUser(user: AuthUser): AuthPrincipal {
  return {
    userId: user.id,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    permissionLevel: user.role,
    ...(user.canonicalId ? { canonicalId: user.canonicalId } : {}),
  };
}
