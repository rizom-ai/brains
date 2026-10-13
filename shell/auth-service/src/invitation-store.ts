import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { createPrefixedId } from "@brains/utils/id";
import type { AuthSetupDeliveryInput } from "./admin-contracts";
import { hashIdentityKey, normalizeIdentityKey } from "./identity-store";
import {
  authInvitationDeliveryAttempts,
  authInvitations,
  type AuthInvitation,
  type AuthInvitationDeliveryAttempt,
} from "./invitation-schema";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authIdentities,
  authIdentityEvidence,
  authPeople,
  authUsers,
  personExternalPeers,
  setupTokens,
  type AuthUser,
  type PersonExternalPeer,
} from "./runtime-schema";
import { setupTokenId } from "./setup-state-store";

/** Provider id recorded for a delivery an Admin confirms by hand. */
export const MANUAL_DELIVERY_PROVIDER_ID = "manual://admin-confirmation";

export interface CreateInvitationInput {
  idempotencyKey: string;
  displayName: string;
  role: "admin" | "trusted";
  delivery: AuthSetupDeliveryInput;
  actorUserId: string;
  peerId?: string;
}

export interface CreateInvitationResult {
  invitation: AuthInvitation;
  user: AuthUser;
  peer?: PersonExternalPeer;
  registration?: {
    setupUrl: string;
    expiresAt: number;
    deliveryAttemptId: string;
  };
}

/**
 * An invitation that exists durably but has not been delivered yet.
 *
 * Creation and delivery are separate on purpose: the row, the user, the setup
 * token and the first delivery attempt are committed in one transaction, and
 * only then is anything sent. A send that fails leaves a record to recover
 * from rather than a person who was never invited.
 */
export interface CreatedInvitation {
  invitation: AuthInvitation;
  user: AuthUser;
  peer?: PersonExternalPeer;
  attempt: AuthInvitationDeliveryAttempt;
  recipient: string;
  setupToken: string;
  expiresAt: number;
  deliveryMode: "automatic" | "manual";
}

export async function createDurableInvitation(
  db: AuthRuntimeDB,
  setupTokenTtlSeconds: number,
  input: CreateInvitationInput,
  keyHash: string,
): Promise<CreatedInvitation> {
  const displayName = input.displayName.trim();
  if (!displayName) throw new Error("Invitation display name is required");
  const recipient = normalizeDeliverySubject(input.delivery);
  const deliveryMode = input.delivery.mode ?? "automatic";
  const deliveryLabel = input.delivery.label?.trim();
  const identityKeyHash = hashIdentityKey(
    normalizeIdentityKey({
      type: input.delivery.type,
      subject: recipient,
    }),
  );
  const setupToken = `setup_${randomUUID()}`;
  const tokenHash = setupTokenId(setupToken);
  const now = Date.now();
  const expiresAt = Math.floor(now / 1000) + setupTokenTtlSeconds;

  return db.transaction(async (tx) => {
    const [admin] = await tx
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, input.actorUserId))
      .limit(1);
    if (admin?.role !== "admin" || admin.status !== "active") {
      throw new Error("An active Admin is required to create invitations");
    }

    const [boundIdentity] = await tx
      .select({ id: authIdentities.id })
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.identityKeyHash, identityKeyHash),
          isNull(authIdentities.revokedAt),
        ),
      )
      .limit(1);
    if (boundIdentity) {
      throw new Error("Delivery identity is already connected");
    }

    const person = {
      id: createPrefixedId("prsn"),
      displayName,
      profileEntityId: null,
      createdAt: now,
      updatedAt: now,
    } satisfies typeof authPeople.$inferInsert;
    const userId = createPrefixedId("usr");
    const user = {
      id: userId,
      personId: person.id,
      displayName,
      role: input.role,
      status: "invited" as const,
      canonicalId: `user:${userId.slice("usr_".length)}`,
      createdAt: now,
      updatedAt: now,
    } satisfies typeof authUsers.$inferInsert;
    const claim = {
      id: createPrefixedId("aid"),
      personId: person.id,
      type: input.delivery.type,
      issuer: null,
      identityKeyHash,
      deliverySubject: recipient,
      label:
        deliveryLabel && deliveryLabel.length > 0 ? deliveryLabel : recipient,
      visibility: "private" as const,
      revokedAt: null,
      createdAt: now,
    } satisfies typeof authIdentities.$inferInsert;
    const invitation = {
      id: createPrefixedId("inv"),
      userId,
      deliveryClaimId: claim.id,
      currentSetupTokenHash: tokenHash,
      createdByUserId: input.actorUserId,
      idempotencyKeyHash: keyHash,
      state: "pending" as const,
      failureCode: null,
      createdAt: now,
      updatedAt: now,
      sentAt: null,
      claimedAt: null,
      expiredAt: null,
      cancelledAt: null,
    } satisfies typeof authInvitations.$inferInsert;
    const attempt = {
      id: createPrefixedId("ida"),
      invitationId: invitation.id,
      setupTokenHash: tokenHash,
      providerId:
        deliveryMode === "manual"
          ? MANUAL_DELIVERY_PROVIDER_ID
          : input.delivery.type,
      providerDeliveryId: null,
      state: "queued" as const,
      failureCode: null,
      queuedAt: now,
      startedAt: null,
      completedAt: null,
    } satisfies typeof authInvitationDeliveryAttempts.$inferInsert;

    await tx.insert(authPeople).values(person);
    await tx.insert(authUsers).values(user);
    await tx.insert(authIdentities).values(claim);
    await tx.insert(authIdentityEvidence).values({
      id: createPrefixedId("aev"),
      claimId: claim.id,
      sourceKind: "admin",
      sourceId: input.actorUserId,
      assurance: "asserted",
      verifiedAt: null,
      createdAt: now,
    });
    let peer: PersonExternalPeer | undefined;
    if (input.peerId?.trim()) {
      const peerId = input.peerId.trim();
      const [existingPeer] = await tx
        .select({ peerId: personExternalPeers.peerId })
        .from(personExternalPeers)
        .where(eq(personExternalPeers.peerId, peerId))
        .limit(1);
      if (existingPeer) throw new Error("External peer is already linked");
      peer = {
        peerId,
        personId: person.id,
        verificationStatus: "unverified",
        createdByUserId: input.actorUserId,
        createdAt: now,
        updatedAt: now,
      };
      await tx.insert(personExternalPeers).values(peer);
    }
    await tx.insert(setupTokens).values({
      tokenHash,
      purpose: "passkey_setup",
      targetUserId: userId,
      deliveryClaimId: claim.id,
      expiresAt,
      consumedAt: null,
      deliveryKeyHash: null,
      createdAt: Math.floor(now / 1000),
    });
    await tx.insert(authInvitations).values(invitation);
    await tx.insert(authInvitationDeliveryAttempts).values(attempt);

    return {
      invitation,
      user,
      ...(peer ? { peer } : {}),
      attempt,
      recipient,
      setupToken,
      expiresAt,
      deliveryMode,
    };
  });
}

export async function findByIdempotencyKey(
  db: AuthRuntimeDB,
  keyHash: string,
): Promise<CreateInvitationResult | undefined> {
  const [invitation] = await db
    .select()
    .from(authInvitations)
    .where(eq(authInvitations.idempotencyKeyHash, keyHash))
    .limit(1);
  if (!invitation) return undefined;
  const [user] = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, invitation.userId))
    .limit(1);
  if (!user) throw new Error("Invitation user is unavailable");
  const [peer] = await db
    .select()
    .from(personExternalPeers)
    .where(eq(personExternalPeers.personId, user.personId))
    .limit(1);
  return { invitation, user, ...(peer ? { peer } : {}) };
}

function normalizeDeliverySubject(delivery: AuthSetupDeliveryInput): string {
  const subject = delivery.subject.trim();
  if (!subject) throw new Error("Invitation delivery subject is required");
  return subject;
}
