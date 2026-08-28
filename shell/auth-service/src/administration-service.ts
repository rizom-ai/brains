import type { ChannelDescriptor } from "@brains/plugins";
import type {
  AuthAdminUserSummary,
  AuthBrainAnchorConfigKind,
  AuthBrainAnchorSummary,
  AuthIdentitySummary,
  AuthInvitationSummary,
  AuthPasskeySummary,
  AuthSetupDeliveryInput,
} from "./admin-contracts";
import type { AuthAuditEvent, AuthAuditStore } from "./audit-store";
import type { AuthCredentialStore, StoredPasskey } from "./credential-store";
import type {
  AttachAuthIdentityInput,
  AuthIdentityRecord,
  AuthIdentityStore,
} from "./identity-store";
import type { AuthInvitationService } from "./invitation-service";
import type { AuthInvitation } from "./invitation-schema";
import { auditActor, type AuthMutationContext } from "./mutation-context";
import type { UserPasskeyRegistration } from "./passkey-setup-coordinator";
import type { PersonExternalPeerStore } from "./person-external-peer-store";
import { principalFromUser, type AuthPrincipal } from "./principal-service";
import { resolveProfileDisplayNameSafely } from "./profile-display-name";
import type { AuthBrainAnchor, PersonExternalPeer } from "./runtime-schema";
import type { AuthUserManagementService } from "./user-management-service";
import type {
  AuthUserRole,
  AuthUserStatus,
  AuthUserStore,
  CreateAuthUserInput,
} from "./user-store";

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
  peer?: PersonExternalPeer;
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
  peer: PersonExternalPeer;
  registration: UserPasskeyRegistration;
}

export interface AuthAdministrationServiceOptions {
  configuredAnchorKind: AuthBrainAnchorConfigKind;
  resolveProfileDisplayName?: (
    profileEntityId: string,
  ) => Promise<string | undefined>;
  users: AuthUserStore;
  identities: AuthIdentityStore;
  credentials: AuthCredentialStore;
  externalPeers: PersonExternalPeerStore;
  invitations: AuthInvitationService;
  audit: AuthAuditStore;
  management: AuthUserManagementService;
  getChannelDescriptor?: (channelType: string) => ChannelDescriptor | undefined;
  startPasskeyRegistration: (
    userId: string,
    context: AuthMutationContext,
    delivery: AuthSetupDeliveryInput,
  ) => Promise<UserPasskeyRegistration>;
}

export class AuthAdministrationService {
  private readonly configuredAnchorKind: AuthBrainAnchorConfigKind;
  private readonly resolveProfileDisplayName:
    ((profileEntityId: string) => Promise<string | undefined>) | undefined;
  private readonly users: AuthUserStore;
  private readonly identities: AuthIdentityStore;
  private readonly credentials: AuthCredentialStore;
  private readonly externalPeers: PersonExternalPeerStore;
  private readonly invitations: AuthInvitationService;
  private readonly audit: AuthAuditStore;
  private readonly management: AuthUserManagementService;
  private readonly getChannelDescriptor:
    ((channelType: string) => ChannelDescriptor | undefined) | undefined;
  private readonly startPasskeyRegistration: (
    userId: string,
    context: AuthMutationContext,
    delivery: AuthSetupDeliveryInput,
  ) => Promise<UserPasskeyRegistration>;

  constructor(options: AuthAdministrationServiceOptions) {
    this.configuredAnchorKind = options.configuredAnchorKind;
    this.resolveProfileDisplayName = options.resolveProfileDisplayName;
    this.users = options.users;
    this.identities = options.identities;
    this.credentials = options.credentials;
    this.externalPeers = options.externalPeers;
    this.invitations = options.invitations;
    this.audit = options.audit;
    this.management = options.management;
    this.getChannelDescriptor = options.getChannelDescriptor;
    this.startPasskeyRegistration = options.startPasskeyRegistration;
  }

  async revokePasskey(
    credentialId: string,
    context: AuthMutationContext = {},
  ): Promise<void> {
    const credential = await this.credentials.getPasskey(credentialId);
    if (!credential) {
      throw new Error(`Passkey credential not found: ${credentialId}`);
    }

    await this.credentials.revokePasskey(credentialId);
    await this.identities.detachIdentityBySubject({
      userId: credential.userId,
      type: "passkey",
      subject: credentialId,
    });
    await this.management.revokeGrants(credential.userId);
    await this.audit.append({
      ...auditActor(context),
      action: "auth.passkey.revoked",
      targetType: "passkey",
      targetId: credentialId,
      metadata: { userId: credential.userId },
    });
  }

  async createUser(
    input: CreateAuthUserInput,
    context: AuthMutationContext = {},
  ): Promise<AuthPrincipal> {
    const user = await this.management.createUser(input, context);
    return this.principalFromUser(user);
  }

  async cancelInvitation(
    invitationId: string,
    context: AuthMutationContext,
  ): Promise<AuthInvitationSummary> {
    if (!context.actorUserId) {
      throw new Error("Authenticated actor is required for invitation");
    }
    return invitationSummary(
      await this.invitations.cancel(invitationId, context.actorUserId),
    );
  }

  async confirmManualInvitationDelivery(
    invitationId: string,
    deliveryAttemptId: string,
    context: AuthMutationContext,
  ): Promise<AuthInvitationSummary> {
    if (!context.actorUserId) {
      throw new Error("Authenticated actor is required for invitation");
    }
    return invitationSummary(
      await this.invitations.confirmManualDelivery(
        invitationId,
        deliveryAttemptId,
        context.actorUserId,
      ),
    );
  }

  async createInvitation(
    input: CreateInvitationRequest,
    context: AuthMutationContext,
  ): Promise<CreatedInvitationAccess> {
    if (!context.actorUserId) {
      throw new Error("Authenticated actor is required for invitation");
    }
    const created = await this.invitations.create({
      ...input,
      actorUserId: context.actorUserId,
    });
    return {
      invitation: invitationSummary(created.invitation),
      user: await this.principalFromUser(created.user),
      ...(created.peer ? { peer: created.peer } : {}),
      ...(created.registration ? { registration: created.registration } : {}),
    };
  }

  async resendInvitation(
    invitationId: string,
    context: AuthMutationContext,
  ): Promise<CreatedInvitationAccess> {
    if (!context.actorUserId) {
      throw new Error("Authenticated actor is required for invitation");
    }
    const resent = await this.invitations.resend(
      invitationId,
      context.actorUserId,
    );
    return {
      invitation: invitationSummary(resent.invitation),
      user: await this.principalFromUser(resent.user),
      ...(resent.peer ? { peer: resent.peer } : {}),
      ...(resent.registration ? { registration: resent.registration } : {}),
    };
  }

  async inviteExternalPeerPerson(
    input: InviteExternalPeerPersonRequest,
    context: AuthMutationContext,
  ): Promise<InvitedExternalPeerAccess> {
    if (!context.actorUserId) {
      throw new Error("Authenticated actor is required for peer invitation");
    }
    const invited = await this.externalPeers.invitePeerPerson({
      ...input,
      createdByUserId: context.actorUserId,
    });
    const registration = await this.startPasskeyRegistration(
      invited.user.id,
      context,
      input.delivery,
    );
    await this.audit.append({
      ...auditActor(context),
      action: "auth.external_peer.invited",
      targetType: "external_peer",
      targetId: invited.peer.peerId,
      metadata: {
        personId: invited.person.id,
        userId: invited.user.id,
        role: invited.user.role,
      },
    });
    return {
      user: await this.principalFromUser(invited.user),
      peer: invited.peer,
      registration,
    };
  }

  async linkExternalPeer(
    input: LinkExternalPeerRequest,
    context: AuthMutationContext,
  ): Promise<PersonExternalPeer> {
    if (!context.actorUserId) {
      throw new Error("Authenticated actor is required for peer linking");
    }
    const user = await this.users.getUser(input.userId);
    if (!user) throw new Error(`Auth user not found: ${input.userId}`);

    const peer = await this.externalPeers.linkPeer({
      peerId: input.peerId,
      personId: user.personId,
      createdByUserId: context.actorUserId,
    });
    await this.audit.append({
      ...auditActor(context),
      action: "auth.external_peer.linked",
      targetType: "external_peer",
      targetId: peer.peerId,
      metadata: { personId: peer.personId, userId: user.id },
    });
    return peer;
  }

  async unlinkExternalPeer(
    input: UnlinkExternalPeerRequest,
    context: AuthMutationContext,
  ): Promise<PersonExternalPeer> {
    if (!context.actorUserId) {
      throw new Error("Authenticated actor is required for peer unlinking");
    }
    const user = await this.users.getUser(input.userId);
    if (!user) throw new Error(`Auth user not found: ${input.userId}`);

    const peer = await this.externalPeers.unlinkPeer({
      peerId: input.peerId,
      personId: user.personId,
      actorUserId: context.actorUserId,
    });
    await this.audit.append({
      ...auditActor(context),
      action: "auth.external_peer.unlinked",
      targetType: "external_peer",
      targetId: peer.peerId,
      metadata: { personId: peer.personId, userId: user.id },
    });
    return peer;
  }

  async getBrainAnchor(): Promise<AuthBrainAnchorSummary> {
    const [anchor, users] = await Promise.all([
      this.users.getBrainAnchor(),
      this.users.listUsers(),
    ]);
    if (!anchor) throw new Error("Brain anchor is not configured");
    return brainAnchorSummary(
      anchor,
      users,
      this.configuredAnchorKind,
      await this.profileDisplayName(anchor.profileEntityId),
    );
  }

  async listUsers(): Promise<AuthPrincipal[]> {
    const [users, anchor] = await Promise.all([
      this.users.listUsers(),
      this.users.getBrainAnchor(),
    ]);
    return users.map((user) => principalFromUser(user, anchor));
  }

  async listAdminUsers(): Promise<AuthAdminUserSummary[]> {
    const [
      users,
      people,
      identities,
      passkeys,
      externalPeers,
      invitationState,
      anchor,
    ] = await Promise.all([
      this.users.listUsers(),
      this.users.listPeople(),
      this.identities.listAllIdentities(),
      this.credentials.listPasskeys(),
      this.externalPeers.listAll(),
      this.invitations.listWithCurrentSetupExpirations(),
      this.users.getBrainAnchor(),
    ]);
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const identitiesByPersonId = groupBy(identities, (item) => item.personId);
    const passkeysByUserId = groupBy(passkeys, (item) => item.userId);
    const externalPeersByPersonId = groupBy(
      externalPeers,
      (item) => item.personId,
    );
    const invitationsByUserId = groupBy(
      invitationState.invitations,
      (item) => item.userId,
    );

    return Promise.all(
      users.map(async (user) => {
        const profileEntityId = peopleById.get(user.personId)?.profileEntityId;
        const principal = principalFromUser(user, anchor);
        const profileDisplayName = profileEntityId
          ? await this.profileDisplayName(profileEntityId)
          : undefined;
        const invitation = invitationsByUserId.get(user.id)?.at(-1);
        return {
          ...principal,
          displayName: profileDisplayName ?? principal.displayName,
          ...(profileEntityId ? { profileEntityId } : {}),
          ...(invitation
            ? {
                invitation: invitationSummary(
                  invitation,
                  invitationState.expirations.get(invitation.id),
                ),
              }
            : {}),
          identities: (identitiesByPersonId.get(user.personId) ?? []).map(
            (identity) =>
              identitySummary(identity, user.id, this.getChannelDescriptor),
          ),
          passkeys: (passkeysByUserId.get(user.id) ?? []).map(passkeySummary),
          externalPeers: externalPeersByPersonId.get(user.personId) ?? [],
        };
      }),
    );
  }

  listPersonExternalPeers(personId: string): Promise<PersonExternalPeer[]> {
    return this.externalPeers.listByPersonId(personId);
  }

  async listUserIdentities(userId: string): Promise<AuthIdentitySummary[]> {
    return (await this.identities.listIdentities(userId)).map((identity) =>
      identitySummary(identity, userId, this.getChannelDescriptor),
    );
  }

  async listUserPasskeys(userId: string): Promise<AuthPasskeySummary[]> {
    return (await this.credentials.listPasskeys(userId)).map(passkeySummary);
  }

  async updateUserRole(
    userId: string,
    role: AuthUserRole,
    context: AuthMutationContext = {},
  ): Promise<AuthPrincipal> {
    const updated = await this.management.updateRole(userId, role, context);
    return this.principalFromUser(updated);
  }

  async updateUserStatus(
    userId: string,
    status: AuthUserStatus,
    context: AuthMutationContext = {},
  ): Promise<AuthPrincipal> {
    const updated = await this.management.updateStatus(userId, status, context);
    return this.principalFromUser(updated);
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
    await this.management.deleteSuspendedUser(userId, context);
  }

  revokeUserGrants(
    userId: string,
    context: AuthMutationContext = {},
  ): Promise<{ sessions: number; refreshTokens: number }> {
    return this.management.revokeGrants(userId, context);
  }

  async attachIdentity(
    input: AttachAuthIdentityInput,
    context: AuthMutationContext = {},
  ): Promise<AuthIdentityRecord> {
    const identity = await this.identities.attachIdentity({
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
    await this.audit.append({
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
    const identity = await this.identities.detachIdentity(identityId);
    const user = await this.users.getUserByPersonId(identity.personId);
    if (user) await this.management.revokeGrants(user.id);
    await this.audit.append({
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

  listAuditEvents(): Promise<AuthAuditEvent[]> {
    return this.audit.list();
  }

  private async principalFromUser(
    user: Parameters<typeof principalFromUser>[0],
  ): Promise<AuthPrincipal> {
    return principalFromUser(user, await this.users.getBrainAnchor());
  }

  private profileDisplayName(
    profileEntityId: string | null,
  ): Promise<string | undefined> {
    return resolveProfileDisplayNameSafely(
      this.resolveProfileDisplayName,
      profileEntityId,
    );
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

function brainAnchorSummary(
  anchor: AuthBrainAnchor,
  users: Parameters<typeof principalFromUser>[0][],
  configuredKind: AuthBrainAnchorConfigKind,
  profileDisplayName?: string,
): AuthBrainAnchorSummary {
  return {
    kind: anchor.kind,
    configuredKind,
    subjectId: anchor.subjectId,
    displayName: profileDisplayName ?? anchor.displayName,
    ...(anchor.kind === "person" ? { personId: anchor.subjectId } : {}),
    ...(anchor.profileEntityId
      ? { profileEntityId: anchor.profileEntityId }
      : {}),
    administeredBy: users.filter(
      (user) => user.role === "admin" && user.status === "active",
    ).length,
  };
}

function identitySummary(
  identity: AuthIdentityRecord,
  userId: string,
  getChannelDescriptor?: (channelType: string) => ChannelDescriptor | undefined,
): AuthIdentitySummary {
  const label = adminIdentityLabel(identity, getChannelDescriptor);
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

function adminIdentityLabel(
  identity: AuthIdentityRecord,
  getChannelDescriptor?: (channelType: string) => ChannelDescriptor | undefined,
): string | undefined {
  const label = identity.label?.trim();
  const deliverySubject = identity.deliverySubject?.trim();
  if (
    label &&
    label.length > 0 &&
    label !== getChannelDescriptor?.(identity.type)?.subjectLabel
  ) {
    return label;
  }
  if (deliverySubject && deliverySubject.length > 0) return deliverySubject;
  return label && label.length > 0 ? label : undefined;
}

function invitationSummary(
  invitation: AuthInvitation,
  expiresAt?: number,
): AuthInvitationSummary {
  return {
    id: invitation.id,
    userId: invitation.userId,
    state: invitation.state,
    ...(invitation.failureCode ? { failureCode: invitation.failureCode } : {}),
    createdAt: invitation.createdAt,
    updatedAt: invitation.updatedAt,
    ...(expiresAt !== undefined ? { expiresAt } : {}),
    ...(invitation.sentAt !== null ? { sentAt: invitation.sentAt } : {}),
    ...(invitation.claimedAt !== null
      ? { claimedAt: invitation.claimedAt }
      : {}),
    ...(invitation.expiredAt !== null
      ? { expiredAt: invitation.expiredAt }
      : {}),
    ...(invitation.cancelledAt !== null
      ? { cancelledAt: invitation.cancelledAt }
      : {}),
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
