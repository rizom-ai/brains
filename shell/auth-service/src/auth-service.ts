import type {
  ActorRef,
  RuntimeInterfacePrincipalState,
} from "@brains/contracts";
import type {
  AccountSettingsRegistry,
  ChannelDeliveryProvider,
  ChannelDescriptor,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { handleAuthAccountRequest } from "./account-endpoints";
import type {
  CreatedInvitationAccess,
  CreateInvitationRequest,
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
  AuthInvitationChannelSummary,
  AuthInvitationSummary,
  AuthPasskeySummary,
  AuthSetupDeliveryInput,
} from "./admin-contracts";
import type { AppendAuthAuditEventInput, AuthAuditEvent } from "./audit-store";
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
import type { ClientMetadataDocumentResolver } from "./client-metadata-document";
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
import { unauthorizedHtmlResponse } from "./pages";
import type { PasskeySetupRequired } from "./setup-flow";
import type {
  A2APrivateJwk,
  AuthorizationServerMetadata,
  JwksResponse,
  ProtectedResourceMetadata,
  RegisteredOAuthClient,
} from "./types";
import { getErrorMessage } from "@brains/utils/error";

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
  /** Studio profile reference projected into auth runtime state. */
  anchorProfileEntityId?: string;
  /** Resolve the current Studio profile name without copying profile content into auth. */
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
  /** Resolve the registered delivery provider for an invitation channel. */
  getInvitationDeliveryProvider?: (
    channelType: string,
  ) => ChannelDeliveryProvider | undefined;
  /** Resolve serializable metadata for a registered invitation channel. */
  getChannelDescriptor?: (channelType: string) => ChannelDescriptor | undefined;
  /** List serializable channel metadata for Admin presentation. */
  listChannelDescriptors?: () => ChannelDescriptor[];
  /** Validate channel identity types against the finalized app registry. */
  isChannelTypeRegistered?: (channelType: string) => boolean;
  /** Start invitation recovery during initialize. Plugins defer this until channel registration finalizes. */
  autoStartInvitationDeliveryRecovery?: boolean;
  /** Interrupted invitation-delivery recovery cadence. Defaults to one minute. */
  invitationDeliveryRecoveryIntervalMs?: number;
  /** Age after which an unfinished invitation delivery is recoverable. Defaults to five minutes. */
  invitationDeliveryRecoveryStaleMs?: number;
  /** Stale unconsented OAuth-client maintenance interval. Defaults to one hour. */
  oauthClientMaintenanceIntervalMs?: number;
  /** Package-private resolver override for deterministic CIMD tests. */
  clientMetadataDocumentResolver?: ClientMetadataDocumentResolver;
  /** Deployment secret used to encrypt per-account plugin settings at rest. */
  accountSettingsEncryptionKey?: string;
  /** Notify the app-scoped registry after an account is permanently removed. */
  onAccountDeleted?: (actorId: string) => void;
  accountSettingsRegistry?: AccountSettingsRegistry;
  logger?: Logger;
}

export class AuthService {
  private readonly issuer: string;
  private readonly runtime: AuthRuntime;
  private readonly requestRouter: AuthRequestRouter;
  private readonly getInvitationDeliveryProvider:
    ((channelType: string) => ChannelDeliveryProvider | undefined) | undefined;
  private readonly getChannelDescriptor:
    ((channelType: string) => ChannelDescriptor | undefined) | undefined;
  private readonly listChannelDescriptors:
    (() => ChannelDescriptor[]) | undefined;
  private readonly accountSettingsRegistry: AccountSettingsRegistry | undefined;
  private readonly logger: Logger | undefined;

  constructor(options: AuthServiceOptions) {
    this.issuer = normalizeIssuer(options.issuer);
    this.getInvitationDeliveryProvider = options.getInvitationDeliveryProvider;
    this.getChannelDescriptor = options.getChannelDescriptor;
    this.listChannelDescriptors = options.listChannelDescriptors;
    this.accountSettingsRegistry = options.accountSettingsRegistry;
    this.logger = options.logger;
    const isChannelTypeRegistered =
      options.isChannelTypeRegistered ??
      (options.getChannelDescriptor
        ? (channelType: string): boolean =>
            Boolean(options.getChannelDescriptor?.(channelType))
        : undefined);
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
      ...(options.getInvitationDeliveryProvider
        ? {
            getInvitationDeliveryProvider:
              options.getInvitationDeliveryProvider,
          }
        : {}),
      ...(options.getChannelDescriptor
        ? { getChannelDescriptor: options.getChannelDescriptor }
        : {}),
      ...(isChannelTypeRegistered ? { isChannelTypeRegistered } : {}),
      ...(options.autoStartInvitationDeliveryRecovery !== undefined
        ? {
            autoStartInvitationDeliveryRecovery:
              options.autoStartInvitationDeliveryRecovery,
          }
        : {}),
      ...(options.invitationDeliveryRecoveryIntervalMs !== undefined
        ? {
            invitationDeliveryRecoveryIntervalMs:
              options.invitationDeliveryRecoveryIntervalMs,
          }
        : {}),
      ...(options.invitationDeliveryRecoveryStaleMs !== undefined
        ? {
            invitationDeliveryRecoveryStaleMs:
              options.invitationDeliveryRecoveryStaleMs,
          }
        : {}),
      ...(options.oauthClientMaintenanceIntervalMs !== undefined
        ? {
            oauthClientMaintenanceIntervalMs:
              options.oauthClientMaintenanceIntervalMs,
          }
        : {}),
      ...(options.clientMetadataDocumentResolver
        ? {
            clientMetadataDocumentResolver:
              options.clientMetadataDocumentResolver,
          }
        : {}),
      ...(options.accountSettingsEncryptionKey
        ? { accountSettingsEncryptionKey: options.accountSettingsEncryptionKey }
        : {}),
      ...(options.onAccountDeleted
        ? { onAccountDeleted: options.onAccountDeleted }
        : {}),
      ...(options.logger ? { logger: options.logger } : {}),
    });
    this.requestRouter = new AuthRequestRouter({
      setupFlow: this.runtime.setupFlow,
      oauthEndpoints: this.runtime.oauthEndpoints,
      webauthnEndpoints: this.runtime.webauthnEndpoints,
      handleAdminRequest: (request): Promise<Response> =>
        this.handleAdminRequest(request),
      handleAccountRequest: (request): Promise<Response> =>
        this.handleAccountRequest(request),
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

  startInvitationDeliveryRecovery(): Promise<void> {
    return this.runtime.startInvitationDeliveryRecovery();
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

  getAccountSettingsBackend(): ReturnType<
    AuthRuntime["getAccountSettingsStore"]
  > {
    return this.runtime.getAccountSettingsStore();
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
      client_id_metadata_document_supported: true,
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

  async cancelInvitation(
    invitationId: string,
    context: AuthMutationContext,
  ): Promise<AuthInvitationSummary> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .cancelInvitation(invitationId, context);
  }

  async confirmManualInvitationDelivery(
    invitationId: string,
    deliveryAttemptId: string,
    context: AuthMutationContext,
  ): Promise<AuthInvitationSummary> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .confirmManualInvitationDelivery(
        invitationId,
        deliveryAttemptId,
        context,
      );
  }

  async createInvitation(
    input: CreateInvitationRequest,
    context: AuthMutationContext,
  ): Promise<CreatedInvitationAccess> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .createInvitation(input, context);
  }

  async resendInvitation(
    invitationId: string,
    context: AuthMutationContext,
  ): Promise<CreatedInvitationAccess> {
    await this.runtime.ensureStarted();
    return this.runtime
      .getAdministrationService()
      .resendInvitation(invitationId, context);
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

  async listInvitationChannels(): Promise<AuthInvitationChannelSummary[]> {
    await this.runtime.ensureStarted();
    const descriptors = this.listChannelDescriptors?.() ?? [];
    const channels = await Promise.all(
      descriptors.map(async (descriptor) => {
        const deliveryModes: AuthInvitationChannelSummary["deliveryModes"] = [];
        try {
          const provider = this.getInvitationDeliveryProvider?.(
            descriptor.type,
          );
          if (provider && (await provider.isAvailable())) {
            deliveryModes.push("automatic");
          }
        } catch {
          // Dynamic provider failures make automatic delivery unavailable.
        }
        if (descriptor.manualDelivery === true) {
          deliveryModes.push("manual");
        }
        return {
          type: descriptor.type,
          displayName: descriptor.displayName,
          subjectLabel: descriptor.subjectLabel,
          ...(descriptor.subjectPattern
            ? { subjectPattern: descriptor.subjectPattern }
            : {}),
          deliveryModes,
        } satisfies AuthInvitationChannelSummary;
      }),
    );
    return channels;
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

  async deleteSuspendedUser(
    userId: string,
    context: AuthMutationContext = {},
  ): Promise<void> {
    await this.runtime.ensureStarted();
    await this.runtime
      .getAdministrationService()
      .deleteSuspendedUser(userId, context);
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
    const descriptor = this.validateChannelSubject(input.type, input.subject);
    return this.runtime.getAdministrationService().attachIdentity(
      {
        ...input,
        ...(descriptor && !input.deliverySubject
          ? { deliverySubject: input.subject }
          : {}),
      },
      context,
    );
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

  async recordAuditEvent(
    input: AppendAuthAuditEventInput,
  ): Promise<AuthAuditEvent> {
    await this.runtime.ensureStarted();
    return this.runtime.getAuditStore().append(input);
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
    if (delivery) {
      this.validateChannelSubject(delivery.type, delivery.subject);
    }
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
        error: getErrorMessage(error),
      });
      return new Response("Untrusted OAuth issuer", { status: 400 });
    }
    return this.requestRouter.handle(request, requestIssuer);
  }

  async handleWellKnownRequest(request: Request): Promise<Response> {
    return this.handleRequest(request);
  }

  private handleAccountRequest(request: Request): Promise<Response> {
    return handleAuthAccountRequest(request, {
      resolveSession: async (accountRequest) => {
        const resolved =
          await this.runtime.resolveActiveSession(accountRequest);
        return resolved
          ? { userId: resolved.user.id, sessionId: resolved.session.id }
          : undefined;
      },
      account: this.runtime.getAccountService(),
      ...(this.accountSettingsRegistry
        ? { accountSettings: this.accountSettingsRegistry }
        : {}),
    });
  }

  private handleAdminRequest(request: Request): Promise<Response> {
    return handleAuthAdminRequest(request, {
      resolveSession: (adminRequest) => this.resolveSession(adminRequest),
      listUsers: () => this.listUsers(),
      getBrainAnchor: () => this.getBrainAnchor(),
      listAuditEvents: () => this.listAuditEvents(),
      listInvitationChannels: () => this.listInvitationChannels(),
      listAdminUsers: () => this.listAdminUsers(),
      reconcileIdentityProposals: (claims) =>
        this.reconcileIdentityProposals(claims),
      listPersonExternalPeers: (personId) =>
        this.listPersonExternalPeers(personId),
      listUserIdentities: (userId) => this.listUserIdentities(userId),
      listUserPasskeys: (userId) => this.listUserPasskeys(userId),
      cancelInvitation: (invitationId, actorUserId) =>
        this.cancelInvitation(invitationId, { actorUserId }),
      confirmManualInvitationDelivery: (
        invitationId,
        deliveryAttemptId,
        actorUserId,
      ) =>
        this.confirmManualInvitationDelivery(invitationId, deliveryAttemptId, {
          actorUserId,
        }),
      createInvitation: (input, actorUserId) =>
        this.createInvitation(input, { actorUserId }),
      createUser: (input, actorUserId) =>
        this.createUser(input, { actorUserId }),
      inviteExternalPeerPerson: (input, actorUserId) =>
        this.inviteExternalPeerPerson(input, { actorUserId }),
      resendInvitation: (invitationId, actorUserId) =>
        this.resendInvitation(invitationId, { actorUserId }),
      linkExternalPeer: (input, actorUserId) =>
        this.linkExternalPeer(input, { actorUserId }),
      updateUserRole: (userId, role, actorUserId) =>
        this.updateUserRole(userId, role, { actorUserId }),
      updateUserStatus: (userId, status, actorUserId) =>
        this.updateUserStatus(userId, status, { actorUserId }),
      deleteUser: (userId, actorUserId) =>
        this.deleteSuspendedUser(userId, { actorUserId }),
      attachIdentity: async (input, actorUserId) =>
        identitySummary(
          await this.attachIdentity(input, { actorUserId }),
          input.userId,
          this.getChannelDescriptor,
        ),
      detachIdentity: async (identityId, actorUserId) => {
        const identity = await this.detachIdentity(identityId, { actorUserId });
        const user = await this.runtime
          .getUserStore()
          .getUserByPersonId(identity.personId);
        if (!user) throw new Error("Identity person has no auth user");
        return identitySummary(identity, user.id, this.getChannelDescriptor);
      },
      revokePasskey: (credentialId, actorUserId) =>
        this.revokePasskey(credentialId, { actorUserId }),
      startPasskeyRegistration: (userId, actorUserId, delivery) =>
        this.startPasskeyRegistrationForUser(userId, { actorUserId }, delivery),
      revokeUserSessionsAndRefreshTokens: (userId, actorUserId) =>
        this.revokeUserSessionsAndRefreshTokens(userId, { actorUserId }),
    });
  }

  private validateChannelSubject(
    channelType: string,
    subject: string,
  ): ChannelDescriptor | undefined {
    const descriptor = this.getChannelDescriptor?.(channelType);
    if (
      descriptor?.subjectPattern &&
      !new RegExp(
        descriptor.subjectPattern.source,
        descriptor.subjectPattern.flags,
      ).test(subject.trim())
    ) {
      throw new Error(
        `Identity subject is invalid for channel: "${channelType}"`,
      );
    }
    return descriptor;
  }

  private resolveRequestIssuer(request: Request): string {
    return this.runtime.getPrincipalService().resolveRequestIssuer(request);
  }
}

function identitySummary(
  identity: AuthIdentityRecord,
  userId: string,
  getChannelDescriptor?: (channelType: string) => ChannelDescriptor | undefined,
): AuthIdentitySummary {
  const identityLabel = identity.label?.trim();
  const deliverySubject = identity.deliverySubject?.trim();
  const label =
    identityLabel &&
    identityLabel.length > 0 &&
    identityLabel !== getChannelDescriptor?.(identity.type)?.subjectLabel
      ? identityLabel
      : deliverySubject;
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
    ...(label ? { label } : {}),
    ...(identity.verifiedAt !== null
      ? { verifiedAt: identity.verifiedAt }
      : {}),
    ...(identity.revokedAt !== null ? { revokedAt: identity.revokedAt } : {}),
    createdAt: identity.createdAt,
  };
}
