import type {
  ChannelDeliveryProvider,
  ChannelDescriptor,
} from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import { AuthAccountService } from "./account-service";
import { AuthAccountSettingsStore } from "./account-settings-store";
import type { AuthBrainAnchorConfigKind } from "./admin-contracts";
import { AuthAdministrationService } from "./administration-service";
import { AuthAuditStore } from "./audit-store";
import { RuntimeAuthorizationCodeStore } from "./auth-code-store";
import { RuntimeOAuthClientStore } from "./client-store";
import type { ClientMetadataDocumentResolver } from "./client-metadata-document";
import { AuthCredentialStore } from "./credential-store";
import { IdentityReconciliationService } from "./identity-reconciliation-service";
import { AuthIdentityStore } from "./identity-store";
import { InterfacePrincipalStore } from "./interface-principal-store";
import {
  AuthInvitationService,
  DEFAULT_INVITATION_DELIVERY_RECOVERY_STALE_MS,
} from "./invitation-service";
import {
  DEFAULT_INVITATION_DELIVERY_RECOVERY_INTERVAL_MS,
  InvitationDeliverySupervisor,
} from "./invitation-delivery-supervisor";
import { isLoopbackIssuer } from "./issuer";
import { A2AKeyStore, AuthKeyStore } from "./key-store";
import { OAuthEndpoints } from "./oauth-endpoints";
import {
  PasskeyService,
  type PasskeyRegistrationUser,
} from "./passkey-service";
import {
  PasskeySetupCoordinator,
  type UserPasskeyRegistration,
} from "./passkey-setup-coordinator";
import { PersonExternalPeerStore } from "./person-external-peer-store";
import { resolveProfileDisplayNameSafely } from "./profile-display-name";
import { RuntimeA2APeerTrustStore } from "./peer-trust-store";
import { AuthPrincipalService } from "./principal-service";
import { RuntimeRefreshTokenStore } from "./refresh-token-store";
import { AuthRuntimeDatabase } from "./runtime-db";
import type { AuthUser } from "./runtime-schema";
import {
  RuntimeAuthSessionStore,
  type AuthSessionRecord,
} from "./session-store";
import { DEFAULT_SETUP_TOKEN_TTL_SECONDS, SetupFlow } from "./setup-flow";
import { RuntimeSetupStateStore } from "./setup-state-store";
import { TargetedSetupService } from "./targeted-setup-service";
import type { JwksResponse } from "./types";
import { AuthUserManagementService } from "./user-management-service";
import { AuthUserStore } from "./user-store";
import { WebAuthnEndpoints } from "./webauthn-endpoints";

export interface AuthRuntimeOptions {
  storageDir: string;
  issuer: string;
  trustedIssuers: Set<string>;
  allowLocalhostIssuers: boolean;
  anchor: AuthBrainAnchorConfigKind;
  anchorProfileEntityId: string;
  resolveProfileDisplayName?: (
    profileEntityId: string,
  ) => Promise<string | undefined>;
  setupTokenTtlSeconds?: number;
  getInvitationDeliveryProvider?: (
    channelType: string,
  ) => ChannelDeliveryProvider | undefined;
  getChannelDescriptor?: (channelType: string) => ChannelDescriptor | undefined;
  isChannelTypeRegistered?: (channelType: string) => boolean;
  autoStartInvitationDeliveryRecovery?: boolean;
  invitationDeliveryRecoveryIntervalMs?: number;
  invitationDeliveryRecoveryStaleMs?: number;
  oauthClientMaintenanceIntervalMs?: number;
  clientMetadataDocumentResolver?: ClientMetadataDocumentResolver;
  accountSettingsEncryptionKey?: string;
  onAccountDeleted?: (actorId: string) => void;
  logger?: Logger;
}

export class AuthRuntime {
  readonly keyStore: AuthKeyStore;
  readonly a2aKeyStore: A2AKeyStore;
  readonly clientStore: RuntimeOAuthClientStore;
  readonly authCodeStore: RuntimeAuthorizationCodeStore;
  readonly sessionStore: RuntimeAuthSessionStore;
  readonly peerTrustStore: RuntimeA2APeerTrustStore;
  readonly passkeyService: PasskeyService;
  readonly setupFlow: SetupFlow;
  readonly oauthEndpoints: OAuthEndpoints;
  readonly webauthnEndpoints: WebAuthnEndpoints;

  private readonly runtimeDatabase: AuthRuntimeDatabase;
  private readonly refreshTokenStore: RuntimeRefreshTokenStore;
  private readonly issuer: string;
  private readonly trustedIssuers: Set<string>;
  private readonly allowLocalhostIssuers: boolean;
  private readonly anchor: AuthBrainAnchorConfigKind;
  private readonly anchorProfileEntityId: string;
  private readonly setupTokenTtlSeconds: number;
  private readonly getInvitationDeliveryProvider:
    ((channelType: string) => ChannelDeliveryProvider | undefined) | undefined;
  private readonly getChannelDescriptor:
    ((channelType: string) => ChannelDescriptor | undefined) | undefined;
  private readonly isChannelTypeRegistered:
    ((channelType: string) => boolean) | undefined;
  private readonly autoStartInvitationDeliveryRecovery: boolean;
  private readonly invitationDeliveryRecoveryIntervalMs: number;
  private readonly invitationDeliveryRecoveryStaleMs: number;
  private readonly resolveProfileDisplayName:
    ((profileEntityId: string) => Promise<string | undefined>) | undefined;
  private readonly accountSettingsEncryptionKey: string | undefined;
  private readonly onAccountDeleted: ((actorId: string) => void) | undefined;
  private readonly logger: Logger | undefined;
  private accountSettingsStore: AuthAccountSettingsStore | undefined;
  private userStore: AuthUserStore | undefined;
  private identityReconciliationService:
    IdentityReconciliationService | undefined;
  private passkeySetupCoordinator: PasskeySetupCoordinator | undefined;
  private userManagementService: AuthUserManagementService | undefined;
  private principalService: AuthPrincipalService | undefined;
  private administrationService: AuthAdministrationService | undefined;
  private accountService: AuthAccountService | undefined;
  private invitationService: AuthInvitationService | undefined;
  private invitationDeliverySupervisor:
    InvitationDeliverySupervisor | undefined;
  private interfacePrincipalStore: InterfacePrincipalStore | undefined;
  private auditStore: AuthAuditStore | undefined;
  private initialization: Promise<void> | undefined;
  private firstAdminInitialization: Promise<AuthUser> | undefined;
  private closePromise: Promise<void> | undefined;

  constructor(options: AuthRuntimeOptions) {
    this.issuer = options.issuer;
    this.trustedIssuers = options.trustedIssuers;
    this.allowLocalhostIssuers = options.allowLocalhostIssuers;
    this.anchor = options.anchor;
    this.anchorProfileEntityId = options.anchorProfileEntityId;
    this.setupTokenTtlSeconds =
      options.setupTokenTtlSeconds ?? DEFAULT_SETUP_TOKEN_TTL_SECONDS;
    this.getInvitationDeliveryProvider = options.getInvitationDeliveryProvider;
    this.getChannelDescriptor = options.getChannelDescriptor;
    this.isChannelTypeRegistered = options.isChannelTypeRegistered;
    this.autoStartInvitationDeliveryRecovery =
      options.autoStartInvitationDeliveryRecovery ?? true;
    this.invitationDeliveryRecoveryIntervalMs =
      options.invitationDeliveryRecoveryIntervalMs ??
      DEFAULT_INVITATION_DELIVERY_RECOVERY_INTERVAL_MS;
    this.invitationDeliveryRecoveryStaleMs =
      options.invitationDeliveryRecoveryStaleMs ??
      DEFAULT_INVITATION_DELIVERY_RECOVERY_STALE_MS;
    this.resolveProfileDisplayName = options.resolveProfileDisplayName;
    this.accountSettingsEncryptionKey = options.accountSettingsEncryptionKey;
    this.onAccountDeleted = options.onAccountDeleted;
    this.logger = options.logger;
    this.runtimeDatabase = new AuthRuntimeDatabase({
      storageDir: options.storageDir,
    });
    this.keyStore = new AuthKeyStore(this.runtimeDatabase);
    this.a2aKeyStore = new A2AKeyStore(this.runtimeDatabase);
    this.clientStore = new RuntimeOAuthClientStore(
      this.runtimeDatabase,
      this.issuer,
    );
    this.authCodeStore = new RuntimeAuthorizationCodeStore(
      this.runtimeDatabase,
    );
    this.sessionStore = new RuntimeAuthSessionStore(this.runtimeDatabase);
    this.refreshTokenStore = new RuntimeRefreshTokenStore(this.runtimeDatabase);
    this.peerTrustStore = new RuntimeA2APeerTrustStore(this.runtimeDatabase);
    this.passkeyService = new PasskeyService({
      runtimeDatabase: this.runtimeDatabase,
      ...(options.logger ? { logger: options.logger } : {}),
    });
    const setupStateStore = new RuntimeSetupStateStore(this.runtimeDatabase);
    this.setupFlow = new SetupFlow({
      setupStateStore,
      passkeyService: this.passkeyService,
      setupTokenTtlSeconds: this.setupTokenTtlSeconds,
      resolveSessionUserId: async (request): Promise<string | undefined> =>
        (await this.resolveActiveSession(request))?.user.id,
    });
    this.oauthEndpoints = new OAuthEndpoints({
      clientStore: this.clientStore,
      authCodeStore: this.authCodeStore,
      refreshTokenStore: this.refreshTokenStore,
      resolveSession: async (request): Promise<AuthSessionRecord | undefined> =>
        (await this.resolveActiveSession(request))?.session,
      keyStore: this.keyStore,
      ...(options.clientMetadataDocumentResolver
        ? {
            clientMetadataDocumentResolver:
              options.clientMetadataDocumentResolver,
          }
        : {}),
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
      validateTargetedRegistration: async (setup): Promise<void> => {
        await this.getPasskeySetupCoordinator().validateTargetedRegistration(
          setup,
        );
      },
      completeTargetedRegistration: async (setup): Promise<void> => {
        await this.getPasskeySetupCoordinator().completeTargetedRegistration(
          setup,
        );
      },
      registrationUserProvider: async (
        userId?: string,
      ): Promise<PasskeyRegistrationUser> => {
        const user = userId
          ? await this.getUserStore().getUser(userId)
          : await this.ensureFirstAdminUser();
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
  }

  async initialize(): Promise<void> {
    if (this.closePromise) {
      await this.closePromise;
      this.closePromise = undefined;
    }
    if (this.initialization) return this.initialization;

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

  close(): Promise<void> {
    this.closePromise ??= this.closeInternal();
    return this.closePromise;
  }

  async ensureStarted(): Promise<void> {
    if (this.userStore) return;

    await this.runtimeDatabase.start();
    const identityStore = new AuthIdentityStore(this.runtimeDatabase.db, {
      ...(this.isChannelTypeRegistered
        ? { isChannelTypeRegistered: this.isChannelTypeRegistered }
        : {}),
    });
    this.userStore = new AuthUserStore(this.runtimeDatabase.db);
    this.identityReconciliationService = new IdentityReconciliationService({
      identities: identityStore,
      users: this.userStore,
    });
    const targetedSetupService = new TargetedSetupService(
      this.runtimeDatabase.db,
      identityStore,
    );
    this.interfacePrincipalStore = new InterfacePrincipalStore(
      this.runtimeDatabase.db,
    );
    const personExternalPeerStore = new PersonExternalPeerStore(
      this.runtimeDatabase.db,
    );
    this.auditStore = new AuthAuditStore(this.runtimeDatabase.db);
    this.invitationService = new AuthInvitationService({
      db: this.runtimeDatabase.db,
      issuer: this.issuer,
      setupTokenTtlSeconds: this.setupTokenTtlSeconds,
      deliveryRecoveryStaleMs: this.invitationDeliveryRecoveryStaleMs,
      audit: this.auditStore,
      ...(this.getInvitationDeliveryProvider
        ? { getDeliveryProvider: this.getInvitationDeliveryProvider }
        : {}),
      ...(this.getChannelDescriptor
        ? { getChannelDescriptor: this.getChannelDescriptor }
        : {}),
    });
    this.invitationDeliverySupervisor = new InvitationDeliverySupervisor(
      this.invitationDeliveryRecoveryIntervalMs,
      async (now): Promise<void> => {
        await this.getInvitationService().recoverInterruptedDeliveries(now);
      },
      {
        onError: (error): void => {
          this.logger?.warn("Failed to recover invitation delivery", {
            error,
          });
        },
      },
    );
    this.passkeySetupCoordinator = new PasskeySetupCoordinator({
      issuer: this.issuer,
      users: this.userStore,
      identities: identityStore,
      audit: this.auditStore,
      setupFlow: this.setupFlow,
      targetedSetup: targetedSetupService,
      ...(this.getChannelDescriptor
        ? { getChannelDescriptor: this.getChannelDescriptor }
        : {}),
    });
    this.userManagementService = new AuthUserManagementService({
      users: this.userStore,
      audit: this.auditStore,
      sessions: this.sessionStore,
      refreshTokens: this.refreshTokenStore,
      consumeTargetedSetupTokensForUser: (userId): Promise<number> =>
        this.setupFlow.consumeTargetedSetupTokensForUser(userId),
      ...(this.onAccountDeleted
        ? { onUserDeleted: this.onAccountDeleted }
        : {}),
    });
    this.principalService = new AuthPrincipalService({
      issuer: this.issuer,
      trustedIssuers: this.trustedIssuers,
      allowLocalhostIssuers: this.allowLocalhostIssuers,
      users: this.userStore,
      identities: identityStore,
      sessions: this.sessionStore,
      ensureFirstAdminUser: (): Promise<AuthUser> =>
        this.ensureFirstAdminUser(),
      getJwks: (): Promise<JwksResponse> => this.getJwks(),
    });
    const credentialStore = new AuthCredentialStore(this.runtimeDatabase.db);
    this.accountService = new AuthAccountService({
      users: this.userStore,
      identities: identityStore,
      credentials: credentialStore,
      sessions: this.sessionStore,
      refreshTokens: this.refreshTokenStore,
      passkeys: this.passkeyService,
      audit: this.auditStore,
      ...(this.isChannelTypeRegistered
        ? { isChannelTypeRegistered: this.isChannelTypeRegistered }
        : {}),
    });
    this.administrationService = new AuthAdministrationService({
      configuredAnchorKind: this.anchor,
      ...(this.resolveProfileDisplayName
        ? { resolveProfileDisplayName: this.resolveProfileDisplayName }
        : {}),
      users: this.userStore,
      identities: identityStore,
      credentials: credentialStore,
      externalPeers: personExternalPeerStore,
      invitations: this.getInvitationService(),
      audit: this.auditStore,
      management: this.getUserManagementService(),
      ...(this.getChannelDescriptor
        ? { getChannelDescriptor: this.getChannelDescriptor }
        : {}),
      startPasskeyRegistration: (
        userId,
        context,
        delivery,
      ): Promise<UserPasskeyRegistration> =>
        this.getPasskeySetupCoordinator().startRegistration(
          userId,
          context,
          delivery,
        ),
    });
  }

  getUserStore(): AuthUserStore {
    return required(this.userStore);
  }

  getIdentityReconciliationService(): IdentityReconciliationService {
    return required(this.identityReconciliationService);
  }

  getPasskeySetupCoordinator(): PasskeySetupCoordinator {
    return required(this.passkeySetupCoordinator);
  }

  getPrincipalService(): AuthPrincipalService {
    return required(this.principalService);
  }

  getAdministrationService(): AuthAdministrationService {
    return required(this.administrationService);
  }

  getAccountService(): AuthAccountService {
    return required(this.accountService);
  }

  getInvitationService(): AuthInvitationService {
    return required(this.invitationService);
  }

  async startInvitationDeliveryRecovery(): Promise<void> {
    await this.ensureStarted();
    await this.invitationDeliverySupervisor?.start();
  }

  getInterfacePrincipalStore(): InterfacePrincipalStore {
    return required(this.interfacePrincipalStore);
  }

  getAuditStore(): AuthAuditStore {
    return required(this.auditStore);
  }

  getAccountSettingsStore(): AuthAccountSettingsStore | undefined {
    if (!this.accountSettingsEncryptionKey) return undefined;
    this.accountSettingsStore ??= new AuthAccountSettingsStore(
      this.runtimeDatabase.db,
      this.accountSettingsEncryptionKey,
    );
    return this.accountSettingsStore;
  }

  hasPasskeyCredentials(): Promise<boolean> {
    return this.passkeyService.hasCredentials();
  }

  getSetupUrl(issuer: string = this.issuer): string | undefined {
    return this.setupFlow.getSetupUrl(issuer);
  }

  async getJwks(): Promise<JwksResponse> {
    const [oauthKey, a2aKey] = await Promise.all([
      this.keyStore.getPublicJwk(),
      this.a2aKeyStore.getPublicJwk(),
    ]);
    return { keys: [oauthKey, a2aKey] };
  }

  private getUserManagementService(): AuthUserManagementService {
    return required(this.userManagementService);
  }

  private async initializeInternal(): Promise<void> {
    await this.ensureStarted();
    if (this.autoStartInvitationDeliveryRecovery) {
      await this.startInvitationDeliveryRecovery();
    }
    await this.projectConfiguredBrainAnchor();
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
            "Passkey setup required. Ask through an Admin interface for the setup URL.",
          );
        }
      }
    }
    await this.oauthEndpoints.startClientMaintenance();
  }

  private async closeInternal(): Promise<void> {
    await this.oauthEndpoints.stopClientMaintenance();
    await this.invitationDeliverySupervisor?.close();
    this.invitationDeliverySupervisor = undefined;
    this.userStore = undefined;
    this.identityReconciliationService = undefined;
    this.passkeySetupCoordinator = undefined;
    this.userManagementService = undefined;
    this.principalService = undefined;
    this.administrationService = undefined;
    this.accountService = undefined;
    this.invitationService = undefined;
    this.interfacePrincipalStore = undefined;
    this.auditStore = undefined;
    this.initialization = undefined;
    this.firstAdminInitialization = undefined;
    await this.runtimeDatabase.stop();
  }

  private profileDisplayName(
    profileEntityId: string | null,
  ): Promise<string | undefined> {
    return resolveProfileDisplayNameSafely(
      this.resolveProfileDisplayName,
      profileEntityId,
      this.logger,
    );
  }

  private async projectConfiguredBrainAnchor(): Promise<void> {
    const current = await this.getUserStore().getBrainAnchor();
    const profileDisplayName = await this.profileDisplayName(
      this.anchorProfileEntityId,
    );
    const displayName =
      profileDisplayName ??
      current?.displayName ??
      (this.anchor === "person"
        ? "Admin"
        : this.anchor === "team"
          ? "Team"
          : "Organization");
    await this.getUserStore().configureBrainAnchor({
      kind: this.anchor === "person" ? "person" : "collective",
      displayName,
      profileEntityId: this.anchorProfileEntityId,
      // Only a genuinely resolved profile name is authoritative for the
      // Anchor person's own account; fallbacks never overwrite local names.
      ...(profileDisplayName ? { subjectDisplayName: profileDisplayName } : {}),
    });
  }

  private async ensureFirstAdminUser(): Promise<AuthUser> {
    if (this.firstAdminInitialization) return this.firstAdminInitialization;

    const initialization = (async (): Promise<AuthUser> => {
      const existingUsers = await this.getUserStore().listUsers();
      const user = await this.getUserStore().ensureFirstAdminUser();
      await this.projectConfiguredBrainAnchor();
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
    this.firstAdminInitialization = initialization;
    try {
      return await initialization;
    } finally {
      if (this.firstAdminInitialization === initialization) {
        this.firstAdminInitialization = undefined;
      }
    }
  }

  async resolveActiveSession(
    request: Request,
  ): Promise<{ session: AuthSessionRecord; user: AuthUser } | undefined> {
    await this.ensureStarted();
    return this.getPrincipalService().resolveActiveSession(request);
  }
}

function required<T>(value: T | undefined): T {
  if (!value) throw new Error("Auth service has not been initialized");
  return value;
}
