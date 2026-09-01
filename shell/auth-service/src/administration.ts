import type {
  CreatedInvitationAccess,
  CreateInvitationRequest,
  InvitedExternalPeerAccess,
  InviteExternalPeerPersonRequest,
  LinkExternalPeerRequest,
  UnlinkExternalPeerRequest,
} from "./administration-service";
import type {
  AuthAdminUserSummary,
  AuthAdminRole,
  AuthAdminStatus,
  AuthExternalPeerSummary,
  AuthBrainAnchorSummary,
  AuthInvitationChannelSummary,
  AuthInvitationSummary,
  AuthSetupDeliveryInput,
} from "./admin-contracts";
import type { AuthAudit } from "./capabilities";
import type {
  AttachAuthIdentityInput,
  AuthIdentityRecord,
} from "./identity-store";
import type { AuthMutationContext } from "./mutation-context";
import type { UserPasskeyRegistration } from "./passkey-setup-coordinator";
import type { AuthPrincipal } from "./principal-service";

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
  ): Promise<AuthIdentityRecord>;
  detachIdentity(
    identityId: string,
    context?: AuthMutationContext,
  ): Promise<AuthIdentityRecord>;
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
