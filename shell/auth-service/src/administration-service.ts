import type {
  AuthAdminUserSummary,
  AuthBrainAnchorConfigKind,
  AuthBrainAnchorSummary,
  AuthIdentitySummary,
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
import { auditActor, type AuthMutationContext } from "./mutation-context";
import type { UserPasskeyRegistration } from "./passkey-setup-coordinator";
import type { PersonExternalPeerStore } from "./person-external-peer-store";
import { principalFromUser, type AuthPrincipal } from "./principal-service";
import type { AuthBrainAnchor, PersonExternalPeer } from "./runtime-schema";
import type { AuthUserManagementService } from "./user-management-service";
import type {
  AuthUserRole,
  AuthUserStatus,
  AuthUserStore,
  CreateAuthUserInput,
} from "./user-store";

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
  audit: AuthAuditStore;
  management: AuthUserManagementService;
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
  private readonly audit: AuthAuditStore;
  private readonly management: AuthUserManagementService;
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
    this.audit = options.audit;
    this.management = options.management;
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
    const [users, people, identities, passkeys, externalPeers, anchor] =
      await Promise.all([
        this.users.listUsers(),
        this.users.listPeople(),
        this.identities.listAllIdentities(),
        this.credentials.listPasskeys(),
        this.externalPeers.listAll(),
        this.users.getBrainAnchor(),
      ]);
    const peopleById = new Map(people.map((person) => [person.id, person]));
    const identitiesByPersonId = groupBy(identities, (item) => item.personId);
    const passkeysByUserId = groupBy(passkeys, (item) => item.userId);
    const externalPeersByPersonId = groupBy(
      externalPeers,
      (item) => item.personId,
    );

    return Promise.all(
      users.map(async (user) => {
        const profileEntityId = peopleById.get(user.personId)?.profileEntityId;
        const principal = principalFromUser(user, anchor);
        const profileDisplayName = profileEntityId
          ? await this.profileDisplayName(profileEntityId)
          : undefined;
        return {
          ...principal,
          displayName: profileDisplayName ?? principal.displayName,
          ...(profileEntityId ? { profileEntityId } : {}),
          identities: (identitiesByPersonId.get(user.personId) ?? []).map(
            (identity) => identitySummary(identity, user.id),
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
      identitySummary(identity, userId),
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

  private async profileDisplayName(
    profileEntityId: string | null,
  ): Promise<string | undefined> {
    if (!profileEntityId || !this.resolveProfileDisplayName) return undefined;
    try {
      return await this.resolveProfileDisplayName(profileEntityId);
    } catch {
      return undefined;
    }
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
