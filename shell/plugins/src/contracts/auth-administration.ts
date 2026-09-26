import type {
  AuthAdminRole,
  AuthAdminStatus,
  AuthAdminUserSummary,
  AuthBrainAnchorSummary,
  AuthExternalPeerSummary,
  AuthIdentitySummary,
  AuthInvitationChannelSummary,
  AuthInvitationSummary,
  AuthSetupDeliveryInput,
} from "./auth-admin";
import type { AuthAudit, AuthPrincipal } from "./auth";

/** Who is performing a mutation, for audit attribution. */
export interface AuthMutationContext {
  actorUserId?: string;
}

export interface AttachAuthIdentityInput {
  userId: string;
  type: string;
  subject: string;
  issuer?: string;
  deliverySubject?: string;
  label?: string;
  visibility?: "private" | "trusted" | "public";
  verifiedAt?: number;
  source?: { kind: string; id?: string };
}

export interface UserPasskeyRegistration {
  setupUrl: string;
  expiresAt: number;
  delivery: { type: string; label: string };
}

export interface CreateInvitationRequest {
  idempotencyKey: string;
  displayName: string;
  role: "admin" | "trusted";
  delivery: AuthSetupDeliveryInput;
  peerId?: string;
}

export interface CreatedInvitationAccess {
  invitation: AuthInvitationSummary;
  user: AuthPrincipal;
  peer?: AuthExternalPeerSummary;
  registration?: {
    setupUrl: string;
    expiresAt: number;
    deliveryAttemptId: string;
  };
}

export interface InviteExternalPeerPersonRequest {
  peerId: string;
  displayName: string;
  role: "admin" | "trusted";
  delivery: AuthSetupDeliveryInput;
}

export interface LinkExternalPeerRequest {
  peerId: string;
  userId: string;
}

export interface UnlinkExternalPeerRequest {
  peerId: string;
  userId: string;
}

export interface InvitedExternalPeerAccess {
  user: AuthPrincipal;
  peer: AuthExternalPeerSummary;
  registration: UserPasskeyRegistration;
}

/**
 * What administering this brain's users takes — the deliberate surface behind
 * the People, Invitations, Audit and Administration workspaces.
 *
 * `@brains/admin` used to type against the `AuthService` class, which made
 * every public method on the class part of its de-facto contract: nothing
 * said which of them administration actually needed, and nothing broke when
 * the set drifted. This interface is that set, measured from the plugin's
 * call sites, and `AuthService` implements it nominally so drift fails the
 * build on the class rather than in a consumer.
 *
 * It is intentionally the class's own signatures — mutation methods take an
 * `AuthMutationContext` naming the acting user, and reads return the same
 * summaries the service uses internally — because inventing a second
 * vocabulary for one consumer would be surface without meaning. The HTTP
 * admin endpoints keep their separate, narrower `AuthAdminOperations`
 * adapter; that one is transport-shaped, this one is capability-shaped.
 *
 * Named consumer: @brains/admin.
 */
export interface AuthAdministration extends AuthAudit {
  /** Who this request is from, or undefined when it carries no session. */
  resolveSession(request: Request): Promise<AuthPrincipal | undefined>;

  // People
  listUsers(): Promise<AuthPrincipal[]>;
  listAdminUsers(): Promise<AuthAdminUserSummary[]>;
  getBrainAnchor(): Promise<AuthBrainAnchorSummary>;
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
  revokeUserSessionsAndRefreshTokens(
    userId: string,
    context?: AuthMutationContext,
  ): Promise<{ sessions: number; refreshTokens: number }>;

  // Invitations
  createInvitation(
    input: CreateInvitationRequest,
    context: AuthMutationContext,
  ): Promise<CreatedInvitationAccess>;
  cancelInvitation(
    invitationId: string,
    context: AuthMutationContext,
  ): Promise<AuthInvitationSummary>;
  resendInvitation(
    invitationId: string,
    context: AuthMutationContext,
  ): Promise<CreatedInvitationAccess>;
  confirmManualInvitationDelivery(
    invitationId: string,
    deliveryAttemptId: string,
    context: AuthMutationContext,
  ): Promise<AuthInvitationSummary>;
  listInvitationChannels(): Promise<AuthInvitationChannelSummary[]>;

  // Peers
  inviteExternalPeerPerson(
    input: InviteExternalPeerPersonRequest,
    context: AuthMutationContext,
  ): Promise<InvitedExternalPeerAccess>;
  linkExternalPeer(
    input: LinkExternalPeerRequest,
    context: AuthMutationContext,
  ): Promise<AuthExternalPeerSummary>;
  unlinkExternalPeer(
    input: UnlinkExternalPeerRequest,
    context: AuthMutationContext,
  ): Promise<AuthExternalPeerSummary>;

  // Identities and passkeys
  attachIdentity(
    input: AttachAuthIdentityInput,
    context?: AuthMutationContext,
  ): Promise<AuthIdentitySummary>;
  detachIdentity(
    identityId: string,
    context?: AuthMutationContext,
  ): Promise<AuthIdentitySummary>;
  revokePasskey(
    credentialId: string,
    context?: AuthMutationContext,
  ): Promise<void>;
  startPasskeyRegistrationForUser(
    userId: string,
    context?: AuthMutationContext,
    delivery?: AuthSetupDeliveryInput,
  ): Promise<UserPasskeyRegistration>;

  // Audit comes from AuthAudit: what administration queries is exactly what
  // studio records, one definition rather than drifting copies.
}
