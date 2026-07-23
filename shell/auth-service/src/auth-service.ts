import type {
  ActorRef,
  RuntimeInterfacePrincipalState,
} from "@brains/contracts";
import type { Logger } from "@brains/utils/logger";
import type {
  InvitedExternalPeerAccess,
  InviteExternalPeerPersonRequest,
  LinkExternalPeerRequest,
} from "./administration-service";
import { handleAuthAdminRequest } from "./admin-endpoints";
import type {
  AuthAdminUserSummary,
  AuthIdentityProposalInput,
  AuthIdentityReconciliationResponse,
  AuthBrainAnchorConfigKind,
  AuthBrainAnchorSummary,
  AuthIdentitySummary,
  AuthInterfacePrincipalGrantSummary,
  AuthPasskeySummary,
  AuthSetupDeliveryInput,
} from "./admin-contracts";
import type { AuthAuditEvent } from "./audit-store";
import { AuthRequestRouter } from "./auth-request-router";
import { AuthRuntime } from "./auth-runtime";
import type {
  AttachAuthIdentityInput,
  AuthIdentityRecord,
  ResolveAuthIdentityInput,
} from "./identity-store";
import type { AuthMutationContext } from "./mutation-context";
import type { UserPasskeyRegistration } from "./passkey-setup-coordinator";
import type {
  ConfiguredInterfacePrincipals,
  ResolvedInterfacePrincipal,
} from "./interface-principal-store";
import type {
  A2APeerTrustRecord,
  GrantA2APeerTrustInput,
} from "./peer-trust-store";
import type { AuthRuntimeReplicaOptions } from "./runtime-db";
import type { PersonExternalPeer } from "./runtime-schema";
import type {
  AuthUserRole,
  AuthUserStatus,
  CreateAuthUserInput,
} from "./user-store";
import type {
  AuthSessionRecord,
  CreateAuthSessionResult,
} from "./session-store";
import { absoluteUrl, isLoopbackIssuer, normalizeIssuer } from "./issuer";
import type {
  AuthBearerGrant,
  AuthIdentityAccessResolution,
  AuthPrincipal,
} from "./principal-service";
import type { VerifiedAccessToken } from "./token-verifier";
import { errorMessage } from "./http-responses";
import { unauthorizedHtmlResponse } from "./pages";
import type { PasskeySetupRequired } from "./setup-flow";
import type {
  A2APrivateJwk,
  AuthorizationServerMetadata,
  JwksResponse,
  ProtectedResourceMetadata,
  RegisteredOAuthClient,
} from "./types";

export type { PasskeySetupRequired } from "./setup-flow";

const DEFAULT_ANCHOR_PROFILE_ENTITY_ID = "anchor-profile/anchor-profile";

export interface A2ASigningKey {
  privateJwk: A2APrivateJwk;
  keyId: string;
}

export interface AuthServiceOptions {
  /** Runtime auth storage directory. Must not be the content/brain-data directory. */
  storageDir: string;
  /** Private remote libSQL primary for embedded-replica backup and PITR. */
  replica?: AuthRuntimeReplicaOptions;
  /** Anchor profile flavor declared by brain configuration. */
  anchor?: AuthBrainAnchorConfigKind;
  /** CMS profile reference projected into auth runtime state. */
  anchorProfileEntityId?: string;
  /** Resolve the current CMS profile name without copying profile content into auth. */
  resolveProfileDisplayName?: (
    profileEntityId: string,
  ) => Promise<string | undefined>;
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
  /** Refresh the shell's in-memory exact-principal projection after Admin mutations. */
  onInterfacePrincipalStateChange?: (
    state: RuntimeInterfacePrincipalState,
  ) => void;
  logger?: Logger;
}

export class AuthService {
  private readonly issuer: string;
  private readonly runtime: AuthRuntime;
  private readonly requestRouter: AuthRequestRouter;
  private readonly logger: Logger | undefined;

  constructor(options: AuthServiceOptions) {
    this.issuer = normalizeIssuer(options.issuer);
    this.logger = options.logger;
    this.runtime = new AuthRuntime({
      storageDir: options.storageDir,
      ...(options.replica ? { replica: options.replica } : {}),
      issuer: this.issuer,
      trustedIssuers: new Set([
        this.issuer,
        ...(options.trustedIssuers ?? []).map((issuer) =>
          normalizeIssuer(issuer),
        ),
      ]),
      allowLocalhostIssuers:
        options.allowLocalhostIssuers ?? isLoopbackIssuer(this.issuer),
      anchor: options.anchor ?? "person",
      anchorProfileEntityId:
        options.anchorProfileEntityId ?? DEFAULT_ANCHOR_PROFILE_ENTITY_ID,
      ...(options.resolveProfileDisplayName
        ? { resolveProfileDisplayName: options.resolveProfileDisplayName }
        : {}),
      ...(options.setupTokenTtlSeconds !== undefined
        ? { setupTokenTtlSeconds: options.setupTokenTtlSeconds }
        : {}),
      ...(options.oauthClientMaintenanceIntervalMs !== undefined
        ? {
            oauthClientMaintenanceIntervalMs:
              options.oauthClientMaintenanceIntervalMs,
          }
        : {}),
      ...(options.onInterfacePrincipalStateChange
        ? {
            onInterfacePrincipalStateChange:
              options.onInterfacePrincipalStateChange,
          }
        : {}),
      ...(options.logger ? { logger: options.logger } : {}),
    });
    this.requestRouter = new AuthRequestRouter({
      setupFlow: this.runtime.setupFlow,
      oauthEndpoints: this.runtime.oauthEndpoints,
      webauthnEndpoints: this.runtime.webauthnEndpoints,
      handleAdminRequest: (request): Promise<Response> =>
        this.handleAdminRequest(request),
      revokeSession: async (request): Promise<void> => {
        await this.runtime.sessionStore.revokeSessionFromRequest(request);
      },
      getAuthorizationServerMetadata: (issuer): AuthorizationServerMetadata =>
        this.getAuthorizationServerMetadata(issuer),
      getProtectedResourceMetadata: (
        resource,
        issuer,
      ): ProtectedResourceMetadata =>
        this.getProtectedResourceMetadata(resource, issuer),
      getJwks: (): Promise<JwksResponse> => this.getJwks(),
    });
  }

  getIssuer(): string {
    return this.issuer;
  }

  initialize(): Promise<void> {
    return this.runtime.initialize();
  }

  close(): Promise<void> {
    return this.runtime.close();
  }

  async initializeConfiguredInterfacePrincipals(
    config: ConfiguredInterfacePrincipals,
  ): Promise<RuntimeInterfacePrincipalState> {
    await this.initialize();
    const store = this.runtime.getInterfacePrincipalStore();
    await store.seedConfigOnce(config);
    return store.listActiveState();
  }

  async resolveInterfacePrincipal(
    interfaceType: string,
    subject: string,
  ): Promise<ResolvedInterfacePrincipal | undefined> {
    await this.initialize();
    return this.runtime
      .getInterfacePrincipalStore()
      .resolve(interfaceType, subject);
  }

  async listInterfaceGrants(): Promise<AuthInterfacePrincipalGrantSummary[]> {
    await this.runtime.ensureStarted();
    return this.runtime.getInterfaceAccessAdministrationService().listGrants();
  }

  async upsertInterfaceGrant(
    input: {
      interfaceType: string;
      subject: string;
      label: string;
      permissionLevel: "admin" | "trusted";
    },
    context: AuthMutationContext = {},
  ): Promise<AuthInterfacePrincipalGrantSummary> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getInterfaceAccessAdministrationService()
      .upsertGrant(input, context);
  }

  async revokeInterfaceGrant(
    grantId: string,
    context: AuthMutationContext = {},
  ): Promise<AuthInterfacePrincipalGrantSummary> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getInterfaceAccessAdministrationService()
      .revokeGrant(grantId, context);
  }

  async hasPasskeyCredentials(): Promise<boolean> {
    return this.runtime.passkeyService.hasCredentials();
  }

  async revokePasskey(
    credentialId: string,
    context: AuthMutationContext = {},
  ): Promise<void> {
    await this.runtime.ensureStarted();
    await this.runtime
      .getAdministrationService()
      .revokePasskey(credentialId, context);
  }

  async getJwks(): Promise<JwksResponse> {
    const [oauthKey, a2aKey] = await Promise.all([
      this.runtime.keyStore.getPublicJwk(),
      this.runtime.a2aKeyStore.getPublicJwk(),
    ]);
    return {
      keys: [oauthKey, a2aKey],
    };
  }

  async getA2ASigningKey(): Promise<A2ASigningKey> {
    const privateJwk = await this.runtime.a2aKeyStore.getPrivateJwk();
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
    return this.runtime.peerTrustStore.grant(input, context);
  }

  async getA2APeerTrust(
    domain: string,
  ): Promise<A2APeerTrustRecord | undefined> {
    await this.initialize();
    return this.runtime.peerTrustStore.get(domain);
  }

  async revokeA2APeerTrust(
    domain: string,
    context: AuthMutationContext = {},
  ): Promise<void> {
    await this.initialize();
    return this.runtime.peerTrustStore.revoke(domain, context);
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
    return this.runtime.clientStore.registerClient(input);
  }

  async getRegisteredClient(
    clientId: string,
  ): Promise<RegisteredOAuthClient | undefined> {
    await this.initialize();
    return this.runtime.clientStore.getClient(clientId);
  }

  async createUser(
    input: CreateAuthUserInput,
    context: AuthMutationContext = {},
  ): Promise<AuthPrincipal> {
    await this.runtime.ensureStarted();
    return this.runtime.getAdministrationService().createUser(input, context);
  }

  async inviteExternalPeerPerson(
    input: InviteExternalPeerPersonRequest,
    context: AuthMutationContext,
  ): Promise<InvitedExternalPeerAccess> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .inviteExternalPeerPerson(input, context);
  }

  async linkExternalPeer(
    input: LinkExternalPeerRequest,
    context: AuthMutationContext,
  ): Promise<PersonExternalPeer> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .linkExternalPeer(input, context);
  }

  async getBrainAnchor(): Promise<AuthBrainAnchorSummary> {
    await this.runtime.ensureStarted();
    return this.runtime.getAdministrationService().getBrainAnchor();
  }

  async listUsers(): Promise<AuthPrincipal[]> {
    await this.runtime.ensureStarted();
    return this.runtime.getAdministrationService().listUsers();
  }

  async listAdminUsers(): Promise<AuthAdminUserSummary[]> {
    await this.runtime.ensureStarted();
    return this.runtime.getAdministrationService().listAdminUsers();
  }

  async reconcileIdentityProposals(
    claims: AuthIdentityProposalInput[],
  ): Promise<AuthIdentityReconciliationResponse> {
    await this.runtime.ensureStarted();
    return this.runtime.getIdentityReconciliationService().reconcile(claims);
  }

  async listPersonExternalPeers(
    personId: string,
  ): Promise<PersonExternalPeer[]> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .listPersonExternalPeers(personId);
  }

  async listUserIdentities(userId: string): Promise<AuthIdentitySummary[]> {
    await this.runtime.ensureStarted();
    return this.runtime.getAdministrationService().listUserIdentities(userId);
  }

  async listUserPasskeys(userId: string): Promise<AuthPasskeySummary[]> {
    await this.runtime.ensureStarted();
    return this.runtime.getAdministrationService().listUserPasskeys(userId);
  }

  async updateUserRole(
    userId: string,
    role: AuthUserRole,
    context: AuthMutationContext = {},
  ): Promise<AuthPrincipal> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .updateUserRole(userId, role, context);
  }

  async updateUserStatus(
    userId: string,
    status: AuthUserStatus,
    context: AuthMutationContext = {},
  ): Promise<AuthPrincipal> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .updateUserStatus(userId, status, context);
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
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .revokeUserGrants(userId, context);
  }

  async attachIdentity(
    input: AttachAuthIdentityInput,
    context: AuthMutationContext = {},
  ): Promise<AuthIdentityRecord> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .attachIdentity(input, context);
  }

  async detachIdentity(
    identityId: string,
    context: AuthMutationContext = {},
  ): Promise<AuthIdentityRecord> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .detachIdentity(identityId, context);
  }

  async listAuditEvents(): Promise<AuthAuditEvent[]> {
    await this.runtime.ensureStarted();
    return this.runtime.getAdministrationService().listAuditEvents();
  }

  async resolveActorPrincipal(
    actor: ActorRef,
  ): Promise<AuthPrincipal | undefined> {
    await this.runtime.ensureStarted();
    return this.runtime.getPrincipalService().resolveActor(actor);
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
    await this.runtime.ensureStarted();
    return this.runtime.getPrincipalService().resolveIdentity(input);
  }

  async resolveIdentityAccess(
    input: ResolveAuthIdentityInput,
  ): Promise<AuthIdentityAccessResolution> {
    await this.runtime.ensureStarted();
    return this.runtime.getPrincipalService().resolveIdentityAccess(input);
  }

  async createAuthSession(
    subject?: string,
    options: { secure?: boolean } = {},
  ): Promise<CreateAuthSessionResult> {
    await this.runtime.ensureStarted();
    return this.runtime.getPrincipalService().createSession(subject, options);
  }

  async getAuthSession(
    request: Request,
  ): Promise<AuthSessionRecord | undefined> {
    await this.runtime.ensureStarted();
    return this.runtime.getPrincipalService().getSession(request);
  }

  async resolveSession(request: Request): Promise<AuthPrincipal | undefined> {
    await this.runtime.ensureStarted();
    return this.runtime.getPrincipalService().resolveSession(request);
  }

  createAuthLoginResponse(request: Request): Response {
    return unauthorizedHtmlResponse(request);
  }

  async verifyBearerToken(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<VerifiedAccessToken | undefined> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getPrincipalService()
      .verifyBearerToken(request, options);
  }

  async resolveBearerGrant(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<AuthBearerGrant | undefined> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getPrincipalService()
      .resolveBearerGrant(request, options);
  }

  async resolveBearerToken(
    request: Request,
    options: { issuer?: string; audience?: string } = {},
  ): Promise<AuthPrincipal | undefined> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getPrincipalService()
      .resolveBearerToken(request, options);
  }

  getSetupUrl(issuer: string = this.issuer): string | undefined {
    return this.runtime.setupFlow.getSetupUrl(issuer);
  }

  async startPasskeyRegistrationForUser(
    userId: string,
    context: AuthMutationContext = {},
    delivery?: AuthSetupDeliveryInput,
  ): Promise<UserPasskeyRegistration> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getPasskeySetupCoordinator()
      .startRegistration(userId, context, delivery);
  }

  async getPasskeySetupRequired(
    issuer: string = this.issuer,
  ): Promise<PasskeySetupRequired | undefined> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getPasskeySetupCoordinator()
      .getPasskeySetupRequired(issuer);
  }

  async getPasskeySetupRequiredForDelivery(
    issuer: string = this.issuer,
  ): Promise<PasskeySetupRequired | undefined> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getPasskeySetupCoordinator()
      .getPasskeySetupRequiredForDelivery(issuer);
  }

  async hasSetupEmailDelivery(
    setupTokenIdValue: string,
    recipient: string,
  ): Promise<boolean> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getPasskeySetupCoordinator()
      .hasSetupEmailDelivery(setupTokenIdValue, recipient);
  }

  async recordSetupEmailDelivery(
    setupTokenIdValue: string,
    recipient: string,
    options: { deliveryId?: string } = {},
  ): Promise<void> {
    await this.runtime.ensureStarted();
    await this.runtime
      .getPasskeySetupCoordinator()
      .recordSetupEmailDelivery(setupTokenIdValue, recipient, options);
  }

  async handleRequest(request: Request): Promise<Response> {
    await this.initialize();

    let requestIssuer: string;
    try {
      requestIssuer = this.resolveRequestIssuer(request);
    } catch (error) {
      this.logger?.warn("Rejected OAuth request from untrusted issuer", {
        error: errorMessage(error, String(error)),
      });
      return new Response("Untrusted OAuth issuer", { status: 400 });
    }
    return this.requestRouter.handle(request, requestIssuer);
  }

  async handleWellKnownRequest(request: Request): Promise<Response> {
    return this.handleRequest(request);
  }

  private handleAdminRequest(request: Request): Promise<Response> {
    return handleAuthAdminRequest(request, {
      resolveSession: (adminRequest) => this.resolveSession(adminRequest),
      listUsers: () => this.listUsers(),
      getBrainAnchor: () => this.getBrainAnchor(),
      listAuditEvents: () => this.listAuditEvents(),
      listInterfaceGrants: () => this.listInterfaceGrants(),
      listAdminUsers: () => this.listAdminUsers(),
      reconcileIdentityProposals: (claims) =>
        this.reconcileIdentityProposals(claims),
      listPersonExternalPeers: (personId) =>
        this.listPersonExternalPeers(personId),
      listUserIdentities: (userId) => this.listUserIdentities(userId),
      listUserPasskeys: (userId) => this.listUserPasskeys(userId),
      createUser: (input, actorUserId) =>
        this.createUser(input, { actorUserId }),
      inviteExternalPeerPerson: (input, actorUserId) =>
        this.inviteExternalPeerPerson(input, { actorUserId }),
      linkExternalPeer: (input, actorUserId) =>
        this.linkExternalPeer(input, { actorUserId }),
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
        const user = await this.runtime
          .getUserStore()
          .getUserByPersonId(identity.personId);
        if (!user) throw new Error("Identity person has no auth user");
        return identitySummary(identity, user.id);
      },
      revokePasskey: (credentialId, actorUserId) =>
        this.revokePasskey(credentialId, { actorUserId }),
      startPasskeyRegistration: (userId, actorUserId, delivery) =>
        this.startPasskeyRegistrationForUser(userId, { actorUserId }, delivery),
      revokeUserSessionsAndRefreshTokens: (userId, actorUserId) =>
        this.revokeUserSessionsAndRefreshTokens(userId, { actorUserId }),
      upsertInterfaceGrant: (input, actorUserId) =>
        this.upsertInterfaceGrant(input, { actorUserId }),
      revokeInterfaceGrant: (grantId, actorUserId) =>
        this.revokeInterfaceGrant(grantId, { actorUserId }),
    });
  }

  private resolveRequestIssuer(request: Request): string {
    return this.runtime.getPrincipalService().resolveRequestIssuer(request);
  }
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
