import type { ActorRef } from "@brains/contracts";
import { nowSeconds } from "@brains/utils/date";
import type { Logger } from "@brains/utils/logger";
import { handleAuthAdminRequest } from "./admin-endpoints";
import type {
  AuthAdminUserSummary,
  AuthAgentPersonReconciliationResponse,
  AuthIdentitySummary,
  AuthPasskeySummary,
} from "./admin-contracts";
import { AuthAuditStore, type AuthAuditEvent } from "./audit-store";
import {
  AuthorizationCodeStore,
  RuntimeAuthorizationCodeStore,
} from "./auth-code-store";
import { OAuthClientStore, RuntimeOAuthClientStore } from "./client-store";
import { AuthCredentialStore, type StoredPasskey } from "./credential-store";
import { A2AKeyStore, AuthKeyStore } from "./key-store";
import {
  LEGACY_AUTH_FILES_IMPORT,
  LEGACY_SETUP_DELIVERIES_IMPORT,
  LegacyAuthImportStore,
} from "./legacy-import-store";
import {
  PasskeyService,
  type PasskeyRegistrationUser,
} from "./passkey-service";
import { PasskeyStore } from "./passkey-store";
import {
  PersonAgentStore,
  type AgentPersonIdentityClaimInput,
  type PromoteAgentPersonInput,
} from "./person-agent-store";
import {
  A2APeerTrustStore,
  RuntimeA2APeerTrustStore,
  type A2APeerTrustRecord,
  type GrantA2APeerTrustInput,
} from "./peer-trust-store";
import { AuthRuntimeDatabase } from "./runtime-db";
import type { AgentPersonLink, AuthUser } from "./runtime-schema";
import {
  AuthUserStore,
  type AttachAuthIdentityInput,
  type AuthIdentityRecord,
  type AuthUserRole,
  type AuthUserStatus,
  hashIdentityKey,
  normalizeIdentityKey,
  type CreateAuthUserInput,
  type ResolveAuthIdentityInput,
} from "./user-store";
import {
  RefreshTokenStore,
  RuntimeRefreshTokenStore,
} from "./refresh-token-store";
import { handleAuthRepresentationRequest } from "./representation-endpoints";
import { RuntimeSetupStateStore, SetupStateStore } from "./setup-state-store";
import {
  AuthSessionStore,
  clearAuthSessionCookies,
  RuntimeAuthSessionStore,
  type AuthSessionRecord,
  type CreateAuthSessionResult,
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
  type PasskeySetupRequired,
} from "./setup-flow";
import type {
  A2APrivateJwk,
  AuthorizationServerMetadata,
  JwksResponse,
  ProtectedResourceMetadata,
  RegisteredOAuthClient,
} from "./types";

export type { PasskeySetupRequired } from "./setup-flow";

const MIGRATION_SINGLE_OPERATOR_SUBJECT = "single-operator";

export interface AuthPrincipal {
  userId: string;
  personId: string;
  displayName: string;
  role: "anchor" | "trusted" | "public";
  status: "active" | "invited" | "suspended";
  permissionLevel: "anchor" | "trusted" | "public";
  canonicalId?: string;
}

export type AuthIdentityAccessResolution =
  | { state: "resolved"; principal: AuthPrincipal }
  | { state: "denied" }
  | { state: "unbound" };

export interface AuthMutationContext {
  /** Authenticated user performing the mutation, for audit attribution. */
  actorUserId?: string;
}

export interface UserPasskeyRegistration {
  setupUrl: string;
  expiresAt: number;
}

export type PromoteAgentPersonRequest = Omit<
  PromoteAgentPersonInput,
  "createdByUserId"
>;

export interface LinkAgentPersonRequest {
  agentId: string;
  userId: string;
  claims?: AgentPersonIdentityClaimInput[];
}

export interface PromotedAgentAccess {
  user: AuthPrincipal;
  representation: AgentPersonLink;
  registration: UserPasskeyRegistration;
}

export interface A2ASigningKey {
  privateJwk: A2APrivateJwk;
  keyId: string;
}

export interface AuthBearerGrant {
  principal: AuthPrincipal;
  token: VerifiedAccessToken;
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
  /** Stale unconsented OAuth-client maintenance interval. Defaults to one hour. */
  oauthClientMaintenanceIntervalMs?: number;
  logger?: Logger;
}

export class AuthService {
  private readonly issuer: string;
  private readonly trustedIssuers: Set<string>;
  private readonly allowLocalhostIssuers: boolean;
  private readonly runtimeDatabase: AuthRuntimeDatabase;
  private userStore: AuthUserStore | undefined;
  private personAgentStore: PersonAgentStore | undefined;
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
  private readonly legacySessionStore: AuthSessionStore;
  private readonly sessionStore: RuntimeAuthSessionStore;
  private readonly legacyRefreshTokenStore: RefreshTokenStore;
  private readonly refreshTokenStore: RuntimeRefreshTokenStore;
  private readonly legacyPeerTrustStore: A2APeerTrustStore;
  private readonly peerTrustStore: RuntimeA2APeerTrustStore;
  private readonly legacyPasskeyStore: PasskeyStore;
  private readonly legacyImportStore: LegacyAuthImportStore;
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
    this.a2aKeyStore = new A2AKeyStore({
      storageDir: options.storageDir,
      runtimeDatabase: this.runtimeDatabase,
    });
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
    this.legacySessionStore = new AuthSessionStore({
      storageDir: options.storageDir,
    });
    this.sessionStore = new RuntimeAuthSessionStore(this.runtimeDatabase);
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
    this.legacyImportStore = new LegacyAuthImportStore(this.runtimeDatabase);
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
      resolveSession: async (request): Promise<AuthSessionRecord | undefined> =>
        (await this.resolveActiveSession(request))?.session,
      keyStore: this.keyStore,
      ...(options.oauthClientMaintenanceIntervalMs !== undefined
        ? {
            clientMaintenanceIntervalMs:
              options.oauthClientMaintenanceIntervalMs,
          }
        : {}),
      onClientMaintenanceError: (error): void => {
        this.logger?.warn("Failed to prune stale OAuth clients", { error });
      },
    });
    this.webauthnEndpoints = new WebAuthnEndpoints({
      passkeyService: this.passkeyService,
      sessionStore: this.sessionStore,
      setupFlow: this.setupFlow,
      recordAuditEvent: async (event): Promise<void> => {
        await this.getAuditStore().append(event);
      },
      completeTargetedRegistration: async (userId: string): Promise<void> => {
        await this.completeTargetedRegistration(userId);
      },
      registrationUserProvider: async (
        userId?: string,
      ): Promise<PasskeyRegistrationUser> => {
        const user = userId
          ? await this.getUserStore().getUser(userId)
          : await this.ensureFirstAnchorUser();
        if (!user || user.status === "suspended") {
          throw new Error("Passkey registration user is unavailable");
        }
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
    const legacyImportComplete = await this.legacyImportStore.isComplete(
      LEGACY_AUTH_FILES_IMPORT,
    );
    const legacySetupDeliveriesImportComplete =
      await this.legacyImportStore.isComplete(LEGACY_SETUP_DELIVERIES_IMPORT);
    if (!legacyImportComplete) {
      await this.migrateLegacyPasskeys();
      await this.migrateLegacySessions();
      await this.migrateLegacyOAuthClients();
      await this.migrateLegacyAuthorizationCodes();
      await this.migrateLegacyRefreshTokens();
      await this.migrateLegacySetupState();
      await this.migrateLegacyPeerTrust();
    }
    await Promise.all([
      this.keyStore.getPrivateJwk(),
      this.a2aKeyStore.getPrivateJwk(),
    ]);
    if (!legacyImportComplete) {
      await this.legacyImportStore.markComplete(LEGACY_AUTH_FILES_IMPORT);
    }
    if (!legacySetupDeliveriesImportComplete) {
      if (legacyImportComplete) {
        await this.migrateLegacySetupState();
      }
      await this.legacyImportStore.markComplete(LEGACY_SETUP_DELIVERIES_IMPORT);
    }
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
    await this.oauthEndpoints.startClientMaintenance();
  }

  async close(): Promise<void> {
    this.oauthEndpoints.stopClientMaintenance();
    this.userStore = undefined;
    this.personAgentStore = undefined;
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
    this.personAgentStore = new PersonAgentStore(this.runtimeDatabase.db);
    this.auditStore = new AuthAuditStore(this.runtimeDatabase.db);
    this.credentialStore = new AuthCredentialStore(this.runtimeDatabase.db);
  }

  private async migrateLegacyPasskeys(): Promise<void> {
    const credentials = await this.legacyPasskeyStore.listCredentials();
    let migrated = 0;
    let skipped = 0;
    let anchorUser: AuthUser | undefined;

    for (const credential of credentials) {
      const user =
        credential.subject === MIGRATION_SINGLE_OPERATOR_SUBJECT
          ? (anchorUser ??= await this.ensureFirstAnchorUser())
          : await this.getUserStore().getUser(credential.subject);
      if (!user) {
        skipped += 1;
        continue;
      }

      const stored = await this.getCredentialStore().getPasskeyRecord(
        credential.id,
      );
      if (stored && stored.userId !== user.id) {
        skipped += 1;
        continue;
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
        source: { kind: "migration", id: "legacy-passkeys.json" },
      });
    }

    if (migrated > 0 || skipped > 0) {
      this.logger?.info("Migrated legacy passkey credentials", {
        migrated,
        skipped,
        ...(anchorUser ? { userId: anchorUser.id } : {}),
      });
    }
  }

  private async migrateLegacySessions(): Promise<void> {
    const sessions = await this.legacySessionStore.listSessions();
    let migrated = 0;
    let skipped = 0;
    let anchorUser: AuthUser | undefined;

    for (const session of sessions) {
      if (session.expires_at <= nowSeconds()) continue;
      const user =
        session.subject === MIGRATION_SINGLE_OPERATOR_SUBJECT
          ? (anchorUser ??= await this.ensureFirstAnchorUser())
          : await this.getUserStore().getUser(session.subject);
      if (!user) {
        skipped += 1;
        continue;
      }
      if (await this.sessionStore.importSession(session, user.id)) {
        migrated += 1;
      }
    }

    if (migrated > 0 || skipped > 0) {
      this.logger?.info("Migrated legacy browser sessions", {
        migrated,
        skipped,
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
    let skipped = 0;
    let anchorUser: AuthUser | undefined;
    for (const code of codes) {
      if (code.consumed_at !== undefined || code.expires_at <= nowSeconds()) {
        continue;
      }
      if (!(await this.clientStore.getClient(code.client_id))) {
        skipped += 1;
        continue;
      }
      const user =
        code.subject === MIGRATION_SINGLE_OPERATOR_SUBJECT
          ? (anchorUser ??= await this.ensureFirstAnchorUser())
          : await this.getUserStore().getUser(code.subject);
      if (!user) {
        skipped += 1;
        continue;
      }
      if (await this.authCodeStore.importCode(code, user.id)) {
        migrated += 1;
      }
    }
    if (migrated > 0 || skipped > 0) {
      this.logger?.info("Migrated legacy OAuth authorization codes", {
        migrated,
        skipped,
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
    let skippedInvalid = 0;
    for (const token of tokens) {
      if (token.revoked_at !== undefined || token.expires_at <= nowSeconds()) {
        continue;
      }
      if (token.subject === MIGRATION_SINGLE_OPERATOR_SUBJECT) {
        skippedLegacy += 1;
        continue;
      }
      const [user, client] = await Promise.all([
        this.getUserStore().getUser(token.subject),
        this.clientStore.getClient(token.client_id),
      ]);
      if (!user || !client) {
        skippedInvalid += 1;
        continue;
      }
      if (await this.refreshTokenStore.importToken(token)) {
        migrated += 1;
      }
    }
    if (migrated > 0 || skippedLegacy > 0 || skippedInvalid > 0) {
      this.logger?.info("Migrated legacy OAuth refresh tokens", {
        migrated,
        skippedLegacy,
        skippedInvalid,
      });
    }
  }

  private getUserStore(): AuthUserStore {
    if (!this.userStore) {
      throw new Error("Auth service has not been initialized");
    }
    return this.userStore;
  }

  private getPersonAgentStore(): PersonAgentStore {
    if (!this.personAgentStore) {
      throw new Error("Auth service has not been initialized");
    }
    return this.personAgentStore;
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

  async revokePasskey(
    credentialId: string,
    context: AuthMutationContext = {},
  ): Promise<void> {
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
      ...auditActor(context),
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
    context: AuthMutationContext = {},
  ): Promise<A2APeerTrustRecord> {
    await this.initialize();
    return this.peerTrustStore.grant(input, context);
  }

  async getA2APeerTrust(
    domain: string,
  ): Promise<A2APeerTrustRecord | undefined> {
    await this.initialize();
    return this.peerTrustStore.get(domain);
  }

  async revokeA2APeerTrust(
    domain: string,
    context: AuthMutationContext = {},
  ): Promise<void> {
    await this.initialize();
    return this.peerTrustStore.revoke(domain, context);
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

  async createUser(
    input: CreateAuthUserInput,
    context: AuthMutationContext = {},
  ): Promise<AuthPrincipal> {
    await this.ensureUserStoreStarted();
    const user = await this.getUserStore().createUser(input);
    await this.getAuditStore().append({
      ...auditActor(context),
      action: "auth.user.created",
      targetType: "user",
      targetId: user.id,
      metadata: { role: user.role, status: user.status },
    });
    return principalFromUser(user);
  }

  async promoteAgentPerson(
    input: PromoteAgentPersonRequest,
    context: AuthMutationContext,
  ): Promise<PromotedAgentAccess> {
    await this.ensureUserStoreStarted();
    if (!context.actorUserId) {
      throw new Error("Authenticated actor is required for agent promotion");
    }
    const promoted = await this.getPersonAgentStore().promoteAgentPerson({
      ...input,
      createdByUserId: context.actorUserId,
    });
    const registration = await this.startPasskeyRegistrationForUser(
      promoted.user.id,
      context,
    );
    await this.getAuditStore().append({
      ...auditActor(context),
      action: "auth.agent_person.promoted",
      targetType: "agent",
      targetId: promoted.link.agentId,
      metadata: {
        personId: promoted.person.id,
        userId: promoted.user.id,
        role: promoted.user.role,
        claimCount: input.claims?.length ?? 0,
      },
    });
    return {
      user: principalFromUser(promoted.user),
      representation: promoted.link,
      registration,
    };
  }

  async linkAgentPerson(
    input: LinkAgentPersonRequest,
    context: AuthMutationContext,
  ): Promise<AgentPersonLink> {
    await this.ensureUserStoreStarted();
    if (!context.actorUserId) {
      throw new Error("Authenticated actor is required for agent linking");
    }
    const user = await this.getUserStore().getUser(input.userId);
    if (!user) throw new Error(`Auth user not found: ${input.userId}`);

    const link = await this.getPersonAgentStore().linkAgent({
      agentId: input.agentId,
      personId: user.personId,
      createdByUserId: context.actorUserId,
      ...(input.claims ? { claims: input.claims } : {}),
    });
    await this.getAuditStore().append({
      ...auditActor(context),
      action: "auth.agent_person.linked",
      targetType: "agent",
      targetId: link.agentId,
      metadata: {
        personId: link.personId,
        userId: user.id,
        status: link.status,
        claimCount: input.claims?.length ?? 0,
      },
    });
    return link;
  }

  async acceptAgentRepresentation(
    agentId: string,
    context: AuthMutationContext,
  ): Promise<AgentPersonLink> {
    await this.ensureUserStoreStarted();
    if (!context.actorUserId) {
      throw new Error(
        "Authenticated actor is required for representation consent",
      );
    }
    const accepted = await this.getPersonAgentStore().acceptRepresentation(
      agentId,
      context.actorUserId,
    );
    await this.getAuditStore().append({
      ...auditActor(context),
      action: "auth.agent_person.accepted",
      targetType: "agent",
      targetId: accepted.agentId,
      metadata: { personId: accepted.personId },
    });
    return accepted;
  }

  async listUsers(): Promise<AuthPrincipal[]> {
    await this.ensureUserStoreStarted();
    return (await this.getUserStore().listUsers()).map(principalFromUser);
  }

  async listAdminUsers(): Promise<AuthAdminUserSummary[]> {
    await this.ensureUserStoreStarted();
    const [users, identities, passkeys, agents] = await Promise.all([
      this.getUserStore().listUsers(),
      this.getUserStore().listAllIdentities(),
      this.getCredentialStore().listPasskeys(),
      this.getPersonAgentStore().listAll(),
    ]);
    const identitiesByPersonId = groupBy(identities, (item) => item.personId);
    const passkeysByUserId = groupBy(passkeys, (item) => item.userId);
    const agentsByPersonId = groupBy(agents, (item) => item.personId);

    return users.map((user) => ({
      ...principalFromUser(user),
      identities: (identitiesByPersonId.get(user.personId) ?? []).map(
        (identity) => identitySummary(identity, user.id),
      ),
      passkeys: (passkeysByUserId.get(user.id) ?? []).map(passkeySummary),
      agents: agentsByPersonId.get(user.personId) ?? [],
    }));
  }

  async reconcileAgentPersonClaims(
    claims: AgentPersonIdentityClaimInput[],
  ): Promise<AuthAgentPersonReconciliationResponse> {
    await this.ensureUserStoreStarted();
    const [identities, users] = await Promise.all([
      this.getUserStore().listAllIdentities(),
      this.getUserStore().listUsers(),
    ]);
    const activeIdentityByHash = new Map(
      identities
        .filter((identity) => identity.revokedAt === null)
        .map((identity) => [identity.identityKeyHash, identity]),
    );
    const userByPersonId = new Map(users.map((user) => [user.personId, user]));

    const reconciledClaims: AuthAgentPersonReconciliationResponse["claims"] =
      claims.map((claim, index) => {
        const identityKeyHash = hashIdentityKey(
          normalizeIdentityKey({
            type: claim.type,
            subject: claim.subject,
            ...(claim.issuer ? { issuer: claim.issuer } : {}),
          }),
        );
        const identity = activeIdentityByHash.get(identityKeyHash);
        if (!identity) {
          return {
            index,
            type: claim.type,
            ...(claim.label ? { label: claim.label } : {}),
            state: "unbound" as const,
          };
        }

        const user = userByPersonId.get(identity.personId);
        const verified = identity.evidence.some(
          (evidence) =>
            evidence.assurance === "verified" && evidence.verifiedAt !== null,
        );
        return {
          index,
          type: claim.type,
          ...(claim.label ? { label: claim.label } : {}),
          state: verified
            ? ("verified_match" as const)
            : ("asserted_match" as const),
          owner: {
            personId: identity.personId,
            ...(user
              ? {
                  userId: user.id,
                  displayName: user.displayName,
                  status: user.status,
                }
              : {}),
          },
        };
      });

    const matchedPersonIds = new Set(
      reconciledClaims.flatMap((claim) =>
        claim.owner ? [claim.owner.personId] : [],
      ),
    );
    if (matchedPersonIds.size > 1) {
      return { state: "cross_person_conflict", claims: reconciledClaims };
    }

    const verifiedMatch = reconciledClaims.find(
      (claim) => claim.state === "verified_match" && claim.owner?.userId,
    );
    if (matchedPersonIds.size === 1 && verifiedMatch?.owner?.userId) {
      return {
        state: "unique_verified_match",
        suggestedUserId: verifiedMatch.owner.userId,
        claims: reconciledClaims,
      };
    }

    return { state: "no_verified_match", claims: reconciledClaims };
  }

  async listPersonAgents(personId: string): Promise<AgentPersonLink[]> {
    await this.ensureUserStoreStarted();
    return this.getPersonAgentStore().listByPersonId(personId);
  }

  async listUserIdentities(userId: string): Promise<AuthIdentitySummary[]> {
    await this.ensureUserStoreStarted();
    return (await this.getUserStore().listIdentities(userId)).map((identity) =>
      identitySummary(identity, userId),
    );
  }

  async listUserPasskeys(userId: string): Promise<AuthPasskeySummary[]> {
    await this.ensureUserStoreStarted();
    return (await this.getCredentialStore().listPasskeys(userId)).map(
      passkeySummary,
    );
  }

  async updateUserRole(
    userId: string,
    role: AuthUserRole,
    context: AuthMutationContext = {},
  ): Promise<AuthPrincipal> {
    await this.ensureUserStoreStarted();
    const current = await this.getUserStore().getUser(userId);
    const updated = await this.getUserStore().updateUserRole(userId, role);
    if (current && current.role !== updated.role) {
      await this.revokeUserSessionsAndRefreshTokens(userId);
      await this.getAuditStore().append({
        ...auditActor(context),
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
    context: AuthMutationContext = {},
  ): Promise<AuthPrincipal> {
    await this.ensureUserStoreStarted();
    const current = await this.getUserStore().getUser(userId);
    const updated = await this.getUserStore().updateUserStatus(userId, status);
    if (current && current.status !== updated.status) {
      await this.revokeUserSessionsAndRefreshTokens(userId);
      await this.getAuditStore().append({
        ...auditActor(context),
        action: "auth.user.status_updated",
        targetType: "user",
        targetId: userId,
        metadata: { from: current.status, to: updated.status },
      });
    }
    return principalFromUser(updated);
  }

  suspendUser(
    userId: string,
    context: AuthMutationContext = {},
  ): Promise<AuthPrincipal> {
    return this.updateUserStatus(userId, "suspended", context);
  }

  async revokeUserSessionsAndRefreshTokens(
    userId: string,
    context: AuthMutationContext = {},
  ): Promise<{ sessions: number; refreshTokens: number }> {
    const [sessions, refreshTokens] = await Promise.all([
      this.sessionStore.revokeSessionsForSubject(userId),
      this.refreshTokenStore.revokeTokensForSubject(userId),
    ]);
    if (context.actorUserId) {
      await this.getAuditStore().append({
        ...auditActor(context),
        action: "auth.user.grants_revoked",
        targetType: "user",
        targetId: userId,
        metadata: { sessions, refreshTokens },
      });
    }
    return { sessions, refreshTokens };
  }

  async attachIdentity(
    input: AttachAuthIdentityInput,
    context: AuthMutationContext = {},
  ): Promise<AuthIdentityRecord> {
    await this.ensureUserStoreStarted();
    const identity = await this.getUserStore().attachIdentity({
      ...input,
      ...(input.source
        ? {}
        : {
            source: {
              kind: "admin" as const,
              ...(context.actorUserId ? { id: context.actorUserId } : {}),
            },
          }),
    });
    await this.getAuditStore().append({
      ...auditActor(context),
      action: "auth.identity.attached",
      targetType: "identity",
      targetId: identity.id,
      metadata: { type: identity.type, userId: input.userId },
    });
    return identity;
  }

  async detachIdentity(
    identityId: string,
    context: AuthMutationContext = {},
  ): Promise<AuthIdentityRecord> {
    await this.ensureUserStoreStarted();
    const identity = await this.getUserStore().detachIdentity(identityId);
    const user = await this.getUserStore().getUserByPersonId(identity.personId);
    if (user) await this.revokeUserSessionsAndRefreshTokens(user.id);
    await this.getAuditStore().append({
      ...auditActor(context),
      action: "auth.identity.detached",
      targetType: "identity",
      targetId: identity.id,
      metadata: {
        type: identity.type,
        ...(user ? { userId: user.id } : {}),
      },
    });
    return identity;
  }

  async listAuditEvents(): Promise<AuthAuditEvent[]> {
    await this.ensureUserStoreStarted();
    return this.getAuditStore().list();
  }

  async resolveActorPrincipal(
    actor: ActorRef,
  ): Promise<AuthPrincipal | undefined> {
    await this.ensureUserStoreStarted();
    if (actor.kind === "user") {
      const user = await this.getUserStore().getUser(actor.userId);
      return user?.status === "active" ? principalFromUser(user) : undefined;
    }
    if (actor.kind !== "external") return undefined;

    const identityKeyHash = actor.externalActorId.startsWith("ext_")
      ? actor.externalActorId.slice("ext_".length)
      : "";
    if (!/^[a-f0-9]{64}$/.test(identityKeyHash)) return undefined;
    const result =
      await this.getUserStore().resolveIdentityHashAccess(identityKeyHash);
    return result.state === "resolved"
      ? principalFromUser(result.user)
      : undefined;
  }

  /**
   * Compatibility-only projection for identity enrichment.
   *
   * @deprecated Use `resolveIdentityAccess()` for every authorization decision.
   * This helper intentionally returns `undefined` for both denied and unbound
   * identities, so callers must never use it before a permission-rule fallback.
   */
  async resolveIdentity(
    input: ResolveAuthIdentityInput,
  ): Promise<AuthPrincipal | undefined> {
    const result = await this.resolveIdentityAccess(input);
    return result.state === "resolved" ? result.principal : undefined;
  }

  async resolveIdentityAccess(
    input: ResolveAuthIdentityInput,
  ): Promise<AuthIdentityAccessResolution> {
    await this.ensureUserStoreStarted();
    const result = await this.getUserStore().resolveIdentityAccess(input);
    return result.state === "resolved"
      ? { state: "resolved", principal: principalFromUser(result.user) }
      : result;
  }

  async createAuthSession(
    subject?: string,
    options: { secure?: boolean } = {},
  ): Promise<CreateAuthSessionResult> {
    await this.ensureUserStoreStarted();
    const sessionSubject =
      !subject || subject === MIGRATION_SINGLE_OPERATOR_SUBJECT
        ? (await this.ensureFirstAnchorUser()).id
        : subject;
    return this.sessionStore.createSession(sessionSubject, options);
  }

  async getAuthSession(
    request: Request,
  ): Promise<AuthSessionRecord | undefined> {
    return this.sessionStore.getSessionFromRequest(request);
  }

  private async resolveActiveSession(
    request: Request,
  ): Promise<{ session: AuthSessionRecord; user: AuthUser } | undefined> {
    await this.ensureUserStoreStarted();
    const session = await this.getAuthSession(request);
    if (!session) return undefined;

    const user = await this.getUserStore().getUser(session.subject);
    return user?.status === "active" ? { session, user } : undefined;
  }

  async resolveSession(request: Request): Promise<AuthPrincipal | undefined> {
    const resolved = await this.resolveActiveSession(request);
    return resolved ? principalFromUser(resolved.user) : undefined;
  }

  createAuthLoginResponse(request: Request): Response {
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

  async resolveBearerGrant(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<AuthBearerGrant | undefined> {
    await this.ensureUserStoreStarted();
    const token = await this.verifyBearerToken(request, options);
    if (!token) return undefined;

    const user = await this.getUserStore().getUser(token.subject);
    return user?.status === "active"
      ? { principal: principalFromUser(user), token }
      : undefined;
  }

  async resolveBearerToken(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<AuthPrincipal | undefined> {
    return (await this.resolveBearerGrant(request, options))?.principal;
  }

  getSetupUrl(issuer: string = this.issuer): string | undefined {
    return this.setupFlow.getSetupUrl(issuer);
  }

  async startPasskeyRegistrationForUser(
    userId: string,
    context: AuthMutationContext = {},
  ): Promise<UserPasskeyRegistration> {
    await this.ensureUserStoreStarted();
    const user = await this.getUserStore().getUser(userId);
    if (!user || user.status === "suspended") {
      throw new Error(`Eligible auth user not found: ${userId}`);
    }
    const setup = await this.setupFlow.createUserPasskeySetup(
      userId,
      this.issuer,
    );
    await this.getAuditStore().append({
      ...auditActor(context),
      action: "auth.passkey.registration_started",
      targetType: "user",
      targetId: userId,
      metadata: { expiresAt: setup.expiresAt },
    });
    return { setupUrl: setup.setupUrl, expiresAt: setup.expiresAt };
  }

  private async completeTargetedRegistration(userId: string): Promise<void> {
    const user = await this.getUserStore().getUser(userId);
    if (!user || user.status === "suspended") {
      throw new Error("Passkey registration user is unavailable");
    }
    if (user.status === "invited") {
      await this.updateUserStatus(user.id, "active", { actorUserId: user.id });
    }

    const links = await this.getPersonAgentStore().listByPersonId(
      user.personId,
    );
    for (const link of links) {
      if (link.status !== "pending") continue;
      const accepted = await this.getPersonAgentStore().acceptRepresentation(
        link.agentId,
        user.id,
      );
      await this.getAuditStore().append({
        actorUserId: user.id,
        action: "auth.agent_person.accepted",
        targetType: "agent",
        targetId: accepted.agentId,
        metadata: { personId: user.personId },
      });
    }
  }

  async getPasskeySetupRequired(
    issuer: string = this.issuer,
  ): Promise<PasskeySetupRequired | undefined> {
    return this.setupFlow.getPasskeySetupRequired(issuer, {
      rotateHidden: true,
    });
  }

  async getPasskeySetupRequiredForDelivery(
    issuer: string = this.issuer,
  ): Promise<PasskeySetupRequired | undefined> {
    return this.setupFlow.getPasskeySetupRequired(issuer);
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

    if (
      path === "/auth/admin/users" ||
      path === "/auth/admin/mutations" ||
      path === "/auth/admin/reconciliation"
    ) {
      return this.handleAdminRequest(request);
    }
    if (path === "/auth/representations") {
      return this.handleRepresentationRequest(request);
    }

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

  private handleRepresentationRequest(request: Request): Promise<Response> {
    return handleAuthRepresentationRequest(request, {
      resolveSession: (representationRequest) =>
        this.resolveSession(representationRequest),
      listPersonAgents: (personId) => this.listPersonAgents(personId),
      acceptRepresentation: (agentId, actorUserId) =>
        this.acceptAgentRepresentation(agentId, { actorUserId }),
    });
  }

  private handleAdminRequest(request: Request): Promise<Response> {
    return handleAuthAdminRequest(request, {
      resolveSession: (adminRequest) => this.resolveSession(adminRequest),
      listUsers: () => this.listUsers(),
      listAdminUsers: () => this.listAdminUsers(),
      reconcileAgentPersonClaims: (claims) =>
        this.reconcileAgentPersonClaims(claims),
      listPersonAgents: (personId) => this.listPersonAgents(personId),
      listUserIdentities: (userId) => this.listUserIdentities(userId),
      listUserPasskeys: (userId) => this.listUserPasskeys(userId),
      createUser: (input, actorUserId) =>
        this.createUser(input, { actorUserId }),
      promoteAgentPerson: (input, actorUserId) =>
        this.promoteAgentPerson(input, { actorUserId }),
      linkAgentPerson: (input, actorUserId) =>
        this.linkAgentPerson(input, { actorUserId }),
      updateUserRole: (userId, role, actorUserId) =>
        this.updateUserRole(userId, role, { actorUserId }),
      updateUserStatus: (userId, status, actorUserId) =>
        this.updateUserStatus(userId, status, { actorUserId }),
      attachIdentity: async (input, actorUserId) =>
        identitySummary(
          await this.attachIdentity(input, { actorUserId }),
          input.userId,
        ),
      detachIdentity: async (identityId, actorUserId) => {
        const identity = await this.detachIdentity(identityId, { actorUserId });
        const user = await this.getUserStore().getUserByPersonId(
          identity.personId,
        );
        if (!user) throw new Error("Identity person has no auth user");
        return identitySummary(identity, user.id);
      },
      revokePasskey: (credentialId, actorUserId) =>
        this.revokePasskey(credentialId, { actorUserId }),
      startPasskeyRegistration: (userId, actorUserId) =>
        this.startPasskeyRegistrationForUser(userId, { actorUserId }),
      revokeUserSessionsAndRefreshTokens: (userId, actorUserId) =>
        this.revokeUserSessionsAndRefreshTokens(userId, { actorUserId }),
    });
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
    const headers = new Headers({
      Location: returnTo,
      "Cache-Control": "no-store",
    });
    for (const cookie of clearAuthSessionCookies(isSecureRequest(request))) {
      headers.append("Set-Cookie", cookie);
    }
    return new Response(null, { status: 302, headers });
  }
}

function groupBy<T>(
  values: T[],
  keyFor: (value: T) => string,
): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    const group = grouped.get(key) ?? [];
    group.push(value);
    grouped.set(key, group);
  }
  return grouped;
}

function auditActor(context: AuthMutationContext): {
  actorUserId?: string;
} {
  return context.actorUserId ? { actorUserId: context.actorUserId } : {};
}

function legacyTimestampToMilliseconds(timestamp: number): number {
  return timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp;
}

function identitySummary(
  identity: AuthIdentityRecord,
  userId: string,
): AuthIdentitySummary {
  return {
    id: identity.id,
    personId: identity.personId,
    userId,
    type: identity.type,
    visibility: identity.visibility,
    evidence: identity.evidence.map((item) => ({
      sourceKind: item.sourceKind,
      ...(item.sourceId ? { sourceId: item.sourceId } : {}),
      assurance: item.assurance,
      ...(item.verifiedAt !== null ? { verifiedAt: item.verifiedAt } : {}),
    })),
    ...(identity.issuer ? { issuer: identity.issuer } : {}),
    ...(identity.label ? { label: identity.label } : {}),
    ...(identity.verifiedAt !== null
      ? { verifiedAt: identity.verifiedAt }
      : {}),
    ...(identity.revokedAt !== null ? { revokedAt: identity.revokedAt } : {}),
    createdAt: identity.createdAt,
  };
}

function passkeySummary(passkey: StoredPasskey): AuthPasskeySummary {
  return {
    id: passkey.id,
    userId: passkey.userId,
    ...(passkey.transports ? { transports: passkey.transports } : {}),
    ...(passkey.credentialDeviceType
      ? { credentialDeviceType: passkey.credentialDeviceType }
      : {}),
    credentialBackedUp: passkey.credentialBackedUp,
    createdAt: passkey.createdAt,
    updatedAt: passkey.updatedAt,
  };
}

function principalFromUser(user: AuthUser): AuthPrincipal {
  return {
    userId: user.id,
    personId: user.personId,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    permissionLevel: user.role,
    ...(user.canonicalId ? { canonicalId: user.canonicalId } : {}),
  };
}
