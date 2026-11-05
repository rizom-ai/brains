import type {
  A2APeerTrustRecord,
  A2ASigningKey,
  AppendAuthAuditEventInput,
  AssignableMember,
  AttachAuthIdentityInput,
  AuthAdminRole,
  AuthAdminStatus,
  AuthAdminUserSummary,
  AuthAuditEvent,
  AuthAuditQuery,
  AuthAuditQueryResult,
  AuthBearerGrant,
  AuthBrainAnchorSummary,
  AuthExternalPeerInvitationAccess,
  AuthIdentityAccessResolution,
  AuthInvitationAccess,
  AuthInvitationChannelSummary,
  AuthInvitationSummary,
  AuthMutationContext,
  AuthPrincipal,
  CreateInvitationRequest,
  GrantA2APeerTrustInput,
  InviteExternalPeerPersonRequest,
  LinkExternalPeerRequest,
  ResolveAuthIdentityInput,
  UnlinkExternalPeerRequest,
  UserPasskeyRegistration,
} from "@brains/contracts";

/**
 * The brain's people, sessions, audit log and A2A trust, as auth-service
 * serves them to plugins. Mutations take the acting user for audit attribution.
 */
export interface AuthBackend {
  getIssuer(): string;
  resolveSession(request: Request): Promise<AuthPrincipal | undefined>;
  createAuthLoginResponse(request: Request): Response;
  resolveBearerGrant(request: Request): Promise<AuthBearerGrant | undefined>;
  resolveIdentityAccess(
    input: ResolveAuthIdentityInput,
  ): Promise<AuthIdentityAccessResolution>;

  listUsers(): Promise<AuthPrincipal[]>;
  listAdminUsers(): Promise<AuthAdminUserSummary[]>;
  getBrainAnchor(): Promise<AuthBrainAnchorSummary>;
  listInvitationChannels(): Promise<AuthInvitationChannelSummary[]>;
  updateUserRole(
    userId: string,
    role: AuthAdminRole,
    context?: AuthMutationContext,
  ): Promise<AuthPrincipal>;
  updateUserStatus(
    userId: string,
    status: AuthAdminStatus,
    context?: AuthMutationContext,
  ): Promise<AuthPrincipal>;
  deleteSuspendedUser(
    userId: string,
    context?: AuthMutationContext,
  ): Promise<void>;
  attachIdentity(
    input: AttachAuthIdentityInput,
    context?: AuthMutationContext,
  ): Promise<unknown>;
  detachIdentity(
    identityId: string,
    context?: AuthMutationContext,
  ): Promise<unknown>;
  revokePasskey(
    credentialId: string,
    context?: AuthMutationContext,
  ): Promise<void>;
  startPasskeyRegistrationForUser(
    userId: string,
    context?: AuthMutationContext,
  ): Promise<UserPasskeyRegistration>;
  revokeUserSessionsAndRefreshTokens(
    userId: string,
    context?: AuthMutationContext,
  ): Promise<{ sessions: number; refreshTokens: number }>;

  createInvitation(
    input: CreateInvitationRequest,
    context: AuthMutationContext,
  ): Promise<AuthInvitationAccess>;
  resendInvitation(
    invitationId: string,
    context: AuthMutationContext,
  ): Promise<AuthInvitationAccess>;
  cancelInvitation(
    invitationId: string,
    context: AuthMutationContext,
  ): Promise<AuthInvitationSummary>;
  confirmManualInvitationDelivery(
    invitationId: string,
    deliveryAttemptId: string,
    context: AuthMutationContext,
  ): Promise<AuthInvitationSummary>;
  inviteExternalPeerPerson(
    input: InviteExternalPeerPersonRequest,
    context: AuthMutationContext,
  ): Promise<AuthExternalPeerInvitationAccess>;
  linkExternalPeer(
    input: LinkExternalPeerRequest,
    context: AuthMutationContext,
  ): Promise<unknown>;
  unlinkExternalPeer(
    input: UnlinkExternalPeerRequest,
    context: AuthMutationContext,
  ): Promise<unknown>;

  recordAuditEvent(input: AppendAuthAuditEventInput): Promise<AuthAuditEvent>;
  queryAuditEvents(query: AuthAuditQuery): Promise<AuthAuditQueryResult>;

  getA2APeerTrust(domain: string): Promise<A2APeerTrustRecord | undefined>;
  grantA2APeerTrust(
    input: GrantA2APeerTrustInput,
    context?: AuthMutationContext,
  ): Promise<A2APeerTrustRecord>;
  revokeA2APeerTrust(
    domain: string,
    context?: AuthMutationContext,
  ): Promise<void>;
  getA2ASigningKey(): Promise<A2ASigningKey>;
}

/** Access to the brain's auth backend, when the brain runs one. */
export interface IAuthNamespace {
  /** The bound backend, or undefined when the brain runs without auth. */
  get(): AuthBackend | undefined;
  /** Bind the brain's one auth backend; the returned function unbinds it. */
  bindBackend(backend: AuthBackend): () => void;
  /** People work can be assigned to; empty without an auth backend. */
  listAssignableMembers(): Promise<AssignableMember[]>;
}
