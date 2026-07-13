import type { Logger } from "@brains/utils/logger";
import { AuthAuditStore, type AuthAuditEvent } from "./audit-store";
import {
  AuthorizationCodeStore,
  RuntimeAuthorizationCodeStore,
} from "./auth-code-store";
import { OAuthClientStore, RuntimeOAuthClientStore } from "./client-store";
import { AuthCredentialStore } from "./credential-store";
import { A2AKeyStore, AuthKeyStore } from "./key-store";
import {
  PasskeyService,
  type PasskeyRegistrationUser,
} from "./passkey-service";
import { PasskeyStore } from "./passkey-store";
import {
  A2APeerTrustStore,
  RuntimeA2APeerTrustStore,
  type A2APeerTrustRecord,
  type GrantA2APeerTrustInput,
} from "./peer-trust-store";
import { AuthRuntimeDatabase } from "./runtime-db";
import type { AuthIdentity, AuthUser } from "./runtime-schema";
import {
  AuthUserStore,
  type AttachAuthIdentityInput,
  type AuthUserRole,
  type AuthUserStatus,
  type CreateAuthUserInput,
  type ResolveAuthIdentityInput,
} from "./user-store";
import {
  RefreshTokenStore,
  RuntimeRefreshTokenStore,
} from "./refresh-token-store";
import { RuntimeSetupStateStore, SetupStateStore } from "./setup-state-store";
import {
  clearOperatorSessionCookie,
  OperatorSessionStore,
  RuntimeOperatorSessionStore,
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
  A2APrivateJwk,
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

export interface A2ASigningKey {
  privateJwk: A2APrivateJwk;
  keyId: string;
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
  private auditStore: AuthAuditStore | undefined;
  private credentialStore: AuthCredentialStore | undefined;
  private initialization: Promise<void> | undefined;
  private firstAnchorInitialization: Promise<AuthUser> | undefined;
  private readonly keyStore: AuthKeyStore;
  private readonly a2aKeyStore: A2AKeyStore;
  private readonly legacyClientStore: OAuthClientStore;
  private readonly clientStore: RuntimeOAuthClientStore;
  private readonly legacyAuthCodeStore: AuthorizationCodeStore;
  private readonly authCodeStore: RuntimeAuthorizationCodeStore;
  private readonly legacySessionStore: OperatorSessionStore;
  private readonly sessionStore: RuntimeOperatorSessionStore;
  private readonly legacyRefreshTokenStore: RefreshTokenStore;
  private readonly refreshTokenStore: RuntimeRefreshTokenStore;
  private readonly legacyPeerTrustStore: A2APeerTrustStore;
  private readonly peerTrustStore: RuntimeA2APeerTrustStore;
  private readonly legacyPasskeyStore: PasskeyStore;
  private readonly passkeyService: PasskeyService;
  private readonly legacySetupStateStore: SetupStateStore;
  private readonly setupStateStore: RuntimeSetupStateStore;
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
    this.keyStore = new AuthKeyStore({
      storageDir: options.storageDir,
      runtimeDatabase: this.runtimeDatabase,
    });
    this.a2aKeyStore = new A2AKeyStore({ storageDir: options.storageDir });
    this.legacyClientStore = new OAuthClientStore({
      storageDir: options.storageDir,
    });
    this.clientStore = new RuntimeOAuthClientStore(this.runtimeDatabase);
    this.legacyAuthCodeStore = new AuthorizationCodeStore({
      storageDir: options.storageDir,
    });
    this.authCodeStore = new RuntimeAuthorizationCodeStore(
      this.runtimeDatabase,
    );
    this.legacySessionStore = new OperatorSessionStore({
      storageDir: options.storageDir,
    });
    this.sessionStore = new RuntimeOperatorSessionStore(this.runtimeDatabase);
    this.legacyRefreshTokenStore = new RefreshTokenStore({
      storageDir: options.storageDir,
    });
    this.refreshTokenStore = new RuntimeRefreshTokenStore(this.runtimeDatabase);
    this.legacyPeerTrustStore = new A2APeerTrustStore({
      storageDir: options.storageDir,
    });
    this.peerTrustStore = new RuntimeA2APeerTrustStore(this.runtimeDatabase);
    this.legacyPasskeyStore = new PasskeyStore({
      storageDir: options.storageDir,
    });
    this.passkeyService = new PasskeyService({
      storageDir: options.storageDir,
      runtimeDatabase: this.runtimeDatabase,
      ...(options.logger ? { logger: options.logger } : {}),
    });
    this.legacySetupStateStore = new SetupStateStore({
      storageDir: options.storageDir,
    });
    this.setupStateStore = new RuntimeSetupStateStore(this.runtimeDatabase);
    this.setupFlow = new SetupFlow({
      setupStateStore: this.setupStateStore,
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
        const user = await this.ensureFirstAnchorUser();
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
    if (this.initialization) {
      return this.initialization;
    }

    const initialization = this.initializeInternal();
    this.initialization = initialization;
    try {
      await initialization;
    } catch (error) {
      if (this.initialization === initialization) {
        this.initialization = undefined;
      }
      throw error;
    }
  }

  private async initializeInternal(): Promise<void> {
    await this.ensureUserStoreStarted();
    await this.migrateLegacyPasskeys();
    await this.migrateLegacySessions();
    await this.migrateLegacyOAuthClients();
    await this.migrateLegacyAuthorizationCodes();
    await this.migrateLegacyRefreshTokens();
    await this.migrateLegacySetupState();
    await this.migrateLegacyPeerTrust();
    await Promise.all([
      this.keyStore.getPrivateJwk(),
      this.a2aKeyStore.getPrivateJwk(),
    ]);
    this.logger?.debug("Auth service signing keys loaded");

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
    this.auditStore = undefined;
    this.credentialStore = undefined;
    this.initialization = undefined;
    this.firstAnchorInitialization = undefined;
    await this.runtimeDatabase.stop();
  }

  private async ensureUserStoreStarted(): Promise<void> {
    if (this.userStore) {
      return;
    }
    await this.runtimeDatabase.start();
    this.userStore = new AuthUserStore(this.runtimeDatabase.db);
    this.auditStore = new AuthAuditStore(this.runtimeDatabase.db);
    this.credentialStore = new AuthCredentialStore(this.runtimeDatabase.db);
  }

  private async migrateLegacyPasskeys(): Promise<void> {
    const credentials = await this.legacyPasskeyStore.listCredentials();
    let migrated = 0;
    let anchorUser: AuthUser | undefined;

    for (const credential of credentials) {
      const user =
        credential.subject === MIGRATION_SINGLE_OPERATOR_SUBJECT
          ? (anchorUser ??= await this.ensureFirstAnchorUser())
          : await this.getUserStore().getUser(credential.subject);
      if (!user) {
        throw new Error(
          `Cannot migrate passkey ${credential.id}: auth user ${credential.subject} was not found`,
        );
      }

      const stored = await this.getCredentialStore().getPasskeyRecord(
        credential.id,
      );
      if (stored && stored.userId !== user.id) {
        throw new Error(
          `Cannot migrate passkey ${credential.id}: credential belongs to another auth user`,
        );
      }

      if (!stored) {
        await this.getCredentialStore().addPasskey({
          id: credential.id,
          userId: user.id,
          publicKey: credential.public_key,
          counter: credential.counter,
          ...(credential.transports
            ? { transports: credential.transports }
            : {}),
          credentialDeviceType: credential.credential_device_type,
          credentialBackedUp: credential.credential_backed_up,
          createdAt: legacyTimestampToMilliseconds(credential.created_at),
          updatedAt: legacyTimestampToMilliseconds(credential.updated_at),
        });
        await this.getAuditStore().append({
          action: "auth.passkey.migrated",
          targetType: "passkey",
          targetId: credential.id,
          metadata: { userId: user.id },
        });
        migrated += 1;
      } else if (stored.revokedAt !== undefined) {
        continue;
      }

      await this.getUserStore().ensureIdentity({
        userId: user.id,
        type: "passkey",
        subject: credential.id,
        label: "Passkey credential",
        verifiedAt: legacyTimestampToMilliseconds(credential.created_at),
      });
    }

    if (migrated > 0) {
      this.logger?.info("Migrated legacy operator passkey credentials", {
        migrated,
        ...(anchorUser ? { userId: anchorUser.id } : {}),
      });
    }
  }

  private async migrateLegacySessions(): Promise<void> {
    const sessions = await this.legacySessionStore.listSessions();
    let migrated = 0;
    let anchorUser: AuthUser | undefined;

    for (const session of sessions) {
      const user =
        session.subject === MIGRATION_SINGLE_OPERATOR_SUBJECT
          ? (anchorUser ??= await this.ensureFirstAnchorUser())
          : await this.getUserStore().getUser(session.subject);
      if (!user) {
        throw new Error(
          `Cannot migrate operator session: auth user ${session.subject} was not found`,
        );
      }
      if (await this.sessionStore.importSession(session, user.id)) {
        migrated += 1;
      }
    }

    if (migrated > 0) {
      this.logger?.info("Migrated legacy operator sessions", {
        migrated,
        ...(anchorUser ? { userId: anchorUser.id } : {}),
      });
    }
  }

  private async migrateLegacyOAuthClients(): Promise<void> {
    const clients = await this.legacyClientStore.listClients();
    let migrated = 0;
    for (const client of clients) {
      if (await this.clientStore.importClient(client)) {
        migrated += 1;
      }
    }
    if (migrated > 0) {
      this.logger?.info("Migrated legacy OAuth clients", { migrated });
    }
  }

  private async migrateLegacyAuthorizationCodes(): Promise<void> {
    const codes = await this.legacyAuthCodeStore.listCodes();
    let migrated = 0;
    let anchorUser: AuthUser | undefined;
    for (const code of codes) {
      const user =
        code.subject === MIGRATION_SINGLE_OPERATOR_SUBJECT
          ? (anchorUser ??= await this.ensureFirstAnchorUser())
          : await this.getUserStore().getUser(code.subject);
      if (!user) {
        throw new Error(
          `Cannot migrate authorization code: auth user ${code.subject} was not found`,
        );
      }
      if (await this.authCodeStore.importCode(code, user.id)) {
        migrated += 1;
      }
    }
    if (migrated > 0) {
      this.logger?.info("Migrated legacy OAuth authorization codes", {
        migrated,
      });
    }
  }

  private async migrateLegacyPeerTrust(): Promise<void> {
    const peers = await this.legacyPeerTrustStore.listPeers();
    let migrated = 0;
    for (const peer of peers) {
      if (await this.peerTrustStore.importPeer(peer)) {
        migrated += 1;
      }
    }
    if (migrated > 0) {
      this.logger?.info("Migrated legacy A2A peer trust", { migrated });
    }
  }

  private async migrateLegacySetupState(): Promise<void> {
    const state = await this.legacySetupStateStore.getMigrationState();
    if (await this.setupStateStore.importState(state)) {
      this.logger?.info("Migrated legacy passkey setup state");
    }
  }

  private async migrateLegacyRefreshTokens(): Promise<void> {
    const tokens = await this.legacyRefreshTokenStore.listTokens();
    let migrated = 0;
    let skippedLegacy = 0;
    for (const token of tokens) {
      if (token.subject === MIGRATION_SINGLE_OPERATOR_SUBJECT) {
        skippedLegacy += 1;
        continue;
      }
      const user = await this.getUserStore().getUser(token.subject);
      if (!user) {
        throw new Error(
          `Cannot migrate refresh token: auth user ${token.subject} was not found`,
        );
      }
      if (await this.refreshTokenStore.importToken(token)) {
        migrated += 1;
      }
    }
    if (migrated > 0 || skippedLegacy > 0) {
      this.logger?.info("Migrated legacy OAuth refresh tokens", {
        migrated,
        skippedLegacy,
      });
    }
  }

  private getUserStore(): AuthUserStore {
    if (!this.userStore) {
      throw new Error("Auth service has not been initialized");
    }
    return this.userStore;
  }

  private getAuditStore(): AuthAuditStore {
    if (!this.auditStore) {
      throw new Error("Auth service has not been initialized");
    }
    return this.auditStore;
  }

  private getCredentialStore(): AuthCredentialStore {
    if (!this.credentialStore) {
      throw new Error("Auth service has not been initialized");
    }
    return this.credentialStore;
  }

  private async ensureFirstAnchorUser(): Promise<AuthUser> {
    if (this.firstAnchorInitialization) {
      return this.firstAnchorInitialization;
    }

    const initialization = (async (): Promise<AuthUser> => {
      const existingUsers = await this.getUserStore().listUsers();
      const user = await this.getUserStore().ensureFirstAnchorUser();
      if (!existingUsers.some((existing) => existing.id === user.id)) {
        await this.getAuditStore().append({
          action: "auth.user.created",
          targetType: "user",
          targetId: user.id,
          metadata: { role: user.role, status: user.status },
        });
      }
      return user;
    })();
    this.firstAnchorInitialization = initialization;
    try {
      return await initialization;
    } finally {
      if (this.firstAnchorInitialization === initialization) {
        this.firstAnchorInitialization = undefined;
      }
    }
  }

  async hasPasskeyCredentials(): Promise<boolean> {
    return this.passkeyService.hasCredentials();
  }

  async revokePasskey(credentialId: string): Promise<void> {
    await this.ensureUserStoreStarted();
    const credential = await this.getCredentialStore().getPasskey(credentialId);
    if (!credential) {
      throw new Error(`Passkey credential not found: ${credentialId}`);
    }

    await this.getCredentialStore().revokePasskey(credentialId);
    await this.getUserStore().detachIdentityBySubject({
      userId: credential.userId,
      type: "passkey",
      subject: credentialId,
    });
    await this.revokeUserSessionsAndRefreshTokens(credential.userId);
    await this.getAuditStore().append({
      action: "auth.passkey.revoked",
      targetType: "passkey",
      targetId: credentialId,
      metadata: { userId: credential.userId },
    });
  }

  async getJwks(): Promise<JwksResponse> {
    const [oauthKey, a2aKey] = await Promise.all([
      this.keyStore.getPublicJwk(),
      this.a2aKeyStore.getPublicJwk(),
    ]);
    return {
      keys: [oauthKey, a2aKey],
    };
  }

  async getA2ASigningKey(): Promise<A2ASigningKey> {
    const privateJwk = await this.a2aKeyStore.getPrivateJwk();
    return {
      privateJwk,
      keyId: absoluteUrl(
        this.issuer,
        `/.well-known/jwks.json#${privateJwk.kid}`,
      ),
    };
  }

  async grantA2APeerTrust(
    input: GrantA2APeerTrustInput,
  ): Promise<A2APeerTrustRecord> {
    await this.initialize();
    return this.peerTrustStore.grant(input);
  }

  async getA2APeerTrust(
    domain: string,
  ): Promise<A2APeerTrustRecord | undefined> {
    await this.initialize();
    return this.peerTrustStore.get(domain);
  }

  async revokeA2APeerTrust(domain: string): Promise<void> {
    await this.initialize();
    return this.peerTrustStore.revoke(domain);
  }

  getAuthorizationServerMetadata(
    issuer: string = this.issuer,
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
    issuer: string = this.issuer,
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
    await this.initialize();
    return this.clientStore.registerClient(input);
  }

  async getRegisteredClient(
    clientId: string,
  ): Promise<RegisteredOAuthClient | undefined> {
    await this.initialize();
    return this.clientStore.getClient(clientId);
  }

  async createUser(input: CreateAuthUserInput): Promise<AuthPrincipal> {
    await this.ensureUserStoreStarted();
    const user = await this.getUserStore().createUser(input);
    await this.getAuditStore().append({
      action: "auth.user.created",
      targetType: "user",
      targetId: user.id,
      metadata: { role: user.role, status: user.status },
    });
    return principalFromUser(user);
  }

  async listUsers(): Promise<AuthPrincipal[]> {
    await this.ensureUserStoreStarted();
    return (await this.getUserStore().listUsers()).map(principalFromUser);
  }

  async updateUserRole(
    userId: string,
    role: AuthUserRole,
  ): Promise<AuthPrincipal> {
    await this.ensureUserStoreStarted();
    const current = await this.getUserStore().getUser(userId);
    const updated = await this.getUserStore().updateUserRole(userId, role);
    if (current && current.role !== updated.role) {
      await this.revokeUserSessionsAndRefreshTokens(userId);
      await this.getAuditStore().append({
        action: "auth.user.role_updated",
        targetType: "user",
        targetId: userId,
        metadata: { from: current.role, to: updated.role },
      });
    }
    return principalFromUser(updated);
  }

  async updateUserStatus(
    userId: string,
    status: AuthUserStatus,
  ): Promise<AuthPrincipal> {
    await this.ensureUserStoreStarted();
    const current = await this.getUserStore().getUser(userId);
    const updated = await this.getUserStore().updateUserStatus(userId, status);
    if (current && current.status !== updated.status) {
      await this.revokeUserSessionsAndRefreshTokens(userId);
      await this.getAuditStore().append({
        action: "auth.user.status_updated",
        targetType: "user",
        targetId: userId,
        metadata: { from: current.status, to: updated.status },
      });
    }
    return principalFromUser(updated);
  }

  suspendUser(userId: string): Promise<AuthPrincipal> {
    return this.updateUserStatus(userId, "suspended");
  }

  async revokeUserSessionsAndRefreshTokens(
    userId: string,
  ): Promise<{ sessions: number; refreshTokens: number }> {
    const [sessions, refreshTokens] = await Promise.all([
      this.sessionStore.revokeSessionsForSubject(userId),
      this.refreshTokenStore.revokeTokensForSubject(userId),
    ]);
    return { sessions, refreshTokens };
  }

  async attachIdentity(input: AttachAuthIdentityInput): Promise<AuthIdentity> {
    await this.ensureUserStoreStarted();
    const identity = await this.getUserStore().attachIdentity(input);
    await this.getAuditStore().append({
      action: "auth.identity.attached",
      targetType: "identity",
      targetId: identity.id,
      metadata: { type: identity.type, userId: identity.userId },
    });
    return identity;
  }

  async detachIdentity(identityId: string): Promise<AuthIdentity> {
    await this.ensureUserStoreStarted();
    const identity = await this.getUserStore().detachIdentity(identityId);
    await this.revokeUserSessionsAndRefreshTokens(identity.userId);
    await this.getAuditStore().append({
      action: "auth.identity.detached",
      targetType: "identity",
      targetId: identity.id,
      metadata: { type: identity.type, userId: identity.userId },
    });
    return identity;
  }

  async listAuditEvents(): Promise<AuthAuditEvent[]> {
    await this.ensureUserStoreStarted();
    return this.getAuditStore().list();
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
        ? (await this.ensureFirstAnchorUser()).id
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

  getSetupUrl(issuer: string = this.issuer): string | undefined {
    return this.setupFlow.getSetupUrl(issuer);
  }

  async getOperatorSetupRequired(
    issuer: string = this.issuer,
  ): Promise<OperatorSetupRequired | undefined> {
    return this.setupFlow.getOperatorSetupRequired(issuer, {
      rotateHidden: true,
    });
  }

  async getOperatorSetupRequiredForDelivery(
    issuer: string = this.issuer,
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
    await this.initialize();

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

function legacyTimestampToMilliseconds(timestamp: number): number {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
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
