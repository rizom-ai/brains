import { randomUUID } from "node:crypto";
import type {
  ChannelDeliveryInput,
  ChannelDeliveryProvider,
  ChannelDeliveryResult,
  ChannelDescriptor,
} from "@brains/plugins";
import { sha256Hex } from "@brains/utils/hash";
import { createPrefixedId } from "@brains/utils/id";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { AuthSetupDeliveryInput } from "./admin-contracts";
import type { AuthAuditStore } from "./audit-store";
import { hashIdentityKey, normalizeIdentityKey } from "./identity-store";
import {
  authInvitationDeliveryAttempts,
  authInvitations,
  type AuthInvitation,
  type AuthInvitationDeliveryAttempt,
} from "./invitation-schema";
import { absoluteUrl } from "./issuer";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authIdentities,
  authIdentityEvidence,
  authPeople,
  authUsers,
  personExternalPeers,
  setupTokenDeliveries,
  setupTokens,
  type AuthUser,
  type PersonExternalPeer,
} from "./runtime-schema";
import { setupDeliveryRecipientHash, setupTokenId } from "./setup-state-store";

export type InvitationDeliveryInput = ChannelDeliveryInput;
export type InvitationDeliveryResult = ChannelDeliveryResult;

const MANUAL_DELIVERY_PROVIDER_ID = "manual://admin-confirmation";

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

export const DEFAULT_INVITATION_DELIVERY_RECOVERY_STALE_MS: number =
  5 * 60 * 1000;

export interface AuthInvitationServiceOptions {
  db: AuthRuntimeDB;
  issuer: string;
  setupTokenTtlSeconds: number;
  audit: AuthAuditStore;
  deliveryRecoveryStaleMs?: number;
  getDeliveryProvider?: (
    channelType: string,
  ) => ChannelDeliveryProvider | undefined;
  getChannelDescriptor?: (channelType: string) => ChannelDescriptor | undefined;
}

interface CreatedInvitation {
  invitation: AuthInvitation;
  user: AuthUser;
  peer?: PersonExternalPeer;
  attempt: AuthInvitationDeliveryAttempt;
  recipient: string;
  setupToken: string;
  expiresAt: number;
  deliveryMode: "automatic" | "manual";
}

interface InterruptedDeliveryCandidate {
  attemptId: string;
  attemptState: "queued" | "sending";
  invitationId: string;
  providerId: string;
  queuedAt: number;
  startedAt: number | null;
}

export class AuthInvitationService {
  private readonly db: AuthRuntimeDB;
  private readonly issuer: string;
  private readonly setupTokenTtlSeconds: number;
  private readonly audit: AuthAuditStore;
  private readonly deliveryRecoveryStaleMs: number;
  private readonly getDeliveryProvider:
    ((channelType: string) => ChannelDeliveryProvider | undefined) | undefined;
  private readonly getChannelDescriptor:
    ((channelType: string) => ChannelDescriptor | undefined) | undefined;
  private readonly creations = new Map<
    string,
    Promise<CreateInvitationResult>
  >();
  private readonly manualConfirmations = new Map<
    string,
    Promise<AuthInvitation>
  >();
  private recovery: Promise<number> | undefined;

  constructor(options: AuthInvitationServiceOptions) {
    this.db = options.db;
    this.issuer = options.issuer;
    this.setupTokenTtlSeconds = options.setupTokenTtlSeconds;
    this.audit = options.audit;
    this.deliveryRecoveryStaleMs = Math.max(
      1,
      options.deliveryRecoveryStaleMs ??
        DEFAULT_INVITATION_DELIVERY_RECOVERY_STALE_MS,
    );
    this.getDeliveryProvider = options.getDeliveryProvider;
    this.getChannelDescriptor = options.getChannelDescriptor;
  }

  create(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    const keyHash = invitationIdempotencyKeyHash(input.idempotencyKey);
    const active = this.creations.get(keyHash);
    if (active) return active;

    const creation = this.createOrReplay(input, keyHash).finally(() => {
      if (this.creations.get(keyHash) === creation) {
        this.creations.delete(keyHash);
      }
    });
    this.creations.set(keyHash, creation);
    return creation;
  }

  async resend(
    invitationId: string,
    actorUserId: string,
  ): Promise<CreateInvitationResult> {
    const delivery = await this.getInvitationDelivery(invitationId);
    await this.ensureDeliveryModeAvailable(
      delivery.channelType,
      delivery.deliveryMode,
    );
    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    const setupToken = `setup_${randomUUID()}`;
    const tokenHash = setupTokenId(setupToken);
    const expiresAt = nowSeconds + this.setupTokenTtlSeconds;
    const created = await this.db.transaction(async (tx) => {
      const [admin] = await tx
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, actorUserId))
        .limit(1);
      if (admin?.role !== "admin" || admin.status !== "active") {
        throw new Error("An active Admin is required to resend invitations");
      }
      const [current] = await tx
        .select()
        .from(authInvitations)
        .where(eq(authInvitations.id, invitationId))
        .limit(1);
      if (!current) throw new Error("Invitation not found");
      if (current.state === "claimed" || current.state === "cancelled") {
        throw new Error("Terminal invitations cannot be resent");
      }
      const [user] = await tx
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, current.userId))
        .limit(1);
      if (user?.status !== "invited") {
        throw new Error("Invitation user is unavailable");
      }
      const [claim] = await tx
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.id, current.deliveryClaimId),
            isNull(authIdentities.revokedAt),
          ),
        )
        .limit(1);
      if (!claim?.deliverySubject) {
        throw new Error("Invitation delivery identity is unavailable");
      }

      await tx
        .update(setupTokens)
        .set({ consumedAt: nowSeconds })
        .where(
          and(
            eq(setupTokens.targetUserId, user.id),
            isNull(setupTokens.consumedAt),
          ),
        );
      await tx.insert(setupTokens).values({
        tokenHash,
        purpose: "passkey_setup",
        targetUserId: user.id,
        deliveryClaimId: claim.id,
        expiresAt,
        consumedAt: null,
        deliveryKeyHash: null,
        createdAt: nowSeconds,
      });
      const [invitation] = await tx
        .update(authInvitations)
        .set({
          currentSetupTokenHash: tokenHash,
          state: "pending",
          failureCode: null,
          sentAt: null,
          expiredAt: null,
          updatedAt: now,
        })
        .where(eq(authInvitations.id, invitationId))
        .returning();
      if (!invitation) throw new Error("Invitation not found");
      const attempt = {
        id: createPrefixedId("ida"),
        invitationId,
        setupTokenHash: tokenHash,
        providerId:
          delivery.deliveryMode === "manual"
            ? MANUAL_DELIVERY_PROVIDER_ID
            : claim.type,
        providerDeliveryId: null,
        state: "queued" as const,
        failureCode: null,
        queuedAt: now,
        startedAt: null,
        completedAt: null,
      } satisfies typeof authInvitationDeliveryAttempts.$inferInsert;
      await tx.insert(authInvitationDeliveryAttempts).values(attempt);
      const [peer] = await tx
        .select()
        .from(personExternalPeers)
        .where(eq(personExternalPeers.personId, user.personId))
        .limit(1);
      return {
        invitation,
        user,
        ...(peer ? { peer } : {}),
        attempt,
        recipient: claim.deliverySubject,
        setupToken,
        expiresAt,
        deliveryMode: delivery.deliveryMode,
      } satisfies CreatedInvitation;
    });

    await this.audit.append({
      actorUserId,
      action: "auth.invitation.resent",
      targetType: "invitation",
      targetId: invitationId,
    });
    const invitation =
      created.deliveryMode === "manual"
        ? created.invitation
        : await this.deliver(created);
    return {
      invitation,
      user: created.user,
      ...(created.peer ? { peer: created.peer } : {}),
      registration: {
        setupUrl: invitationSetupUrl(this.issuer, setupToken),
        expiresAt,
        deliveryAttemptId: created.attempt.id,
      },
    };
  }

  confirmManualDelivery(
    invitationId: string,
    deliveryAttemptId: string,
    actorUserId: string,
  ): Promise<AuthInvitation> {
    const key = `${invitationId}:${deliveryAttemptId}:${actorUserId}`;
    const active = this.manualConfirmations.get(key);
    if (active) return active;
    const confirmation = this.confirmManualDeliveryInternal(
      invitationId,
      deliveryAttemptId,
      actorUserId,
    ).finally(() => {
      if (this.manualConfirmations.get(key) === confirmation) {
        this.manualConfirmations.delete(key);
      }
    });
    this.manualConfirmations.set(key, confirmation);
    return confirmation;
  }

  private async confirmManualDeliveryInternal(
    invitationId: string,
    deliveryAttemptId: string,
    actorUserId: string,
  ): Promise<AuthInvitation> {
    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    const confirmation = await this.db.transaction(async (tx) => {
      const [admin] = await tx
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, actorUserId))
        .limit(1);
      if (admin?.role !== "admin" || admin.status !== "active") {
        throw new Error(
          "An active Admin is required to confirm invitation delivery",
        );
      }
      const [invitation] = await tx
        .select()
        .from(authInvitations)
        .where(eq(authInvitations.id, invitationId))
        .limit(1);
      if (!invitation) throw new Error("Invitation not found");
      const [attempt] = await tx
        .select()
        .from(authInvitationDeliveryAttempts)
        .where(eq(authInvitationDeliveryAttempts.id, deliveryAttemptId))
        .limit(1);
      if (!attempt) {
        throw new Error("Manual delivery attempt is unavailable");
      }
      if (
        attempt.invitationId !== invitation.id ||
        attempt.providerId !== MANUAL_DELIVERY_PROVIDER_ID
      ) {
        throw new Error("Manual delivery attempt is unavailable");
      }
      if (attempt.setupTokenHash !== invitation.currentSetupTokenHash) {
        throw new Error("Manual delivery attempt is no longer current");
      }
      if (attempt.state === "sent" && invitation.state === "sent") {
        return { invitation, confirmedNow: false };
      }
      if (attempt.state !== "queued" || invitation.state !== "pending") {
        throw new Error("Manual delivery attempt cannot be confirmed");
      }
      const [token] = await tx
        .select()
        .from(setupTokens)
        .where(eq(setupTokens.tokenHash, attempt.setupTokenHash))
        .limit(1);
      if (!token) {
        throw new Error("Invitation setup link is unavailable");
      }
      if (token.consumedAt !== null || token.expiresAt <= nowSeconds) {
        throw new Error("Invitation setup link is unavailable");
      }
      const [claim] = await tx
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.id, invitation.deliveryClaimId),
            isNull(authIdentities.revokedAt),
          ),
        )
        .limit(1);
      if (!claim?.deliverySubject) {
        throw new Error("Invitation delivery identity is unavailable");
      }
      const [completedAttempt] = await tx
        .update(authInvitationDeliveryAttempts)
        .set({
          state: "sent",
          completedAt: now,
          failureCode: null,
          providerDeliveryId: null,
        })
        .where(
          and(
            eq(authInvitationDeliveryAttempts.id, attempt.id),
            eq(authInvitationDeliveryAttempts.state, "queued"),
          ),
        )
        .returning();
      if (!completedAttempt) {
        throw new Error("Manual delivery attempt cannot be confirmed");
      }
      const [sentInvitation] = await tx
        .update(authInvitations)
        .set({
          state: "sent",
          sentAt: now,
          updatedAt: now,
          failureCode: null,
        })
        .where(
          and(
            eq(authInvitations.id, invitation.id),
            eq(authInvitations.state, "pending"),
            eq(authInvitations.currentSetupTokenHash, attempt.setupTokenHash),
          ),
        )
        .returning();
      if (!sentInvitation) {
        throw new Error("Manual delivery attempt cannot be confirmed");
      }
      await tx.insert(setupTokenDeliveries).values({
        tokenHash: attempt.setupTokenHash,
        recipientHash: setupDeliveryRecipientHash(claim.deliverySubject),
        deliveredAt: nowSeconds,
        deliveryId: null,
      });
      return { invitation: sentInvitation, confirmedNow: true };
    });

    if (confirmation.confirmedNow) {
      await this.audit.append({
        actorUserId,
        action: "auth.invitation.manual_delivery_confirmed",
        targetType: "invitation",
        targetId: invitationId,
        metadata: { deliveryAttemptId },
      });
    }
    return confirmation.invitation;
  }

  recoverInterruptedDeliveries(now: number = Date.now()): Promise<number> {
    if (this.recovery) return this.recovery;

    const recovery = this.recoverInterruptedDeliveriesInternal(now).finally(
      () => {
        if (this.recovery === recovery) this.recovery = undefined;
      },
    );
    this.recovery = recovery;
    return recovery;
  }

  private async recoverInterruptedDeliveriesInternal(
    now: number,
  ): Promise<number> {
    const staleBefore = now - this.deliveryRecoveryStaleMs;
    const candidates = await this.db
      .select({
        attemptId: authInvitationDeliveryAttempts.id,
        attemptState: authInvitationDeliveryAttempts.state,
        invitationId: authInvitationDeliveryAttempts.invitationId,
        providerId: authInvitationDeliveryAttempts.providerId,
        queuedAt: authInvitationDeliveryAttempts.queuedAt,
        startedAt: authInvitationDeliveryAttempts.startedAt,
      })
      .from(authInvitationDeliveryAttempts)
      .innerJoin(
        authInvitations,
        eq(authInvitations.id, authInvitationDeliveryAttempts.invitationId),
      )
      .where(
        and(
          inArray(authInvitations.state, ["pending", "sending"]),
          or(
            and(
              eq(authInvitationDeliveryAttempts.state, "queued"),
              lte(authInvitationDeliveryAttempts.queuedAt, staleBefore),
            ),
            and(
              eq(authInvitationDeliveryAttempts.state, "sending"),
              lte(authInvitationDeliveryAttempts.startedAt, staleBefore),
            ),
          ),
        ),
      );

    let recoveredCount = 0;
    for (const candidate of candidates) {
      if (
        candidate.attemptState !== "queued" &&
        candidate.attemptState !== "sending"
      ) {
        continue;
      }
      if (!(await this.deliveryAvailable(candidate.providerId))) continue;
      const interruptedCandidate: InterruptedDeliveryCandidate = {
        ...candidate,
        attemptState: candidate.attemptState,
      };
      const recovered = await this.recoverInterruptedDelivery(
        interruptedCandidate,
        staleBefore,
        now,
      );
      if (!recovered) continue;
      recoveredCount += 1;
      await this.audit.append({
        action: "auth.invitation.delivery_recovered",
        targetType: "invitation",
        targetId: recovered.invitation.id,
        metadata: { deliveryType: recovered.attempt.providerId },
      });
      await this.deliver(recovered);
    }
    return recoveredCount;
  }

  async cancel(
    invitationId: string,
    actorUserId: string,
  ): Promise<AuthInvitation> {
    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    const cancelled = await this.db.transaction(async (tx) => {
      const [admin] = await tx
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, actorUserId))
        .limit(1);
      if (admin?.role !== "admin" || admin.status !== "active") {
        throw new Error("An active Admin is required to cancel invitations");
      }
      const [invitation] = await tx
        .select()
        .from(authInvitations)
        .where(eq(authInvitations.id, invitationId))
        .limit(1);
      if (!invitation) throw new Error("Invitation not found");
      if (invitation.state === "cancelled") return invitation;
      if (invitation.state === "claimed") {
        throw new Error("Claimed invitations cannot be cancelled");
      }

      await tx
        .update(setupTokens)
        .set({ consumedAt: nowSeconds })
        .where(
          and(
            eq(setupTokens.targetUserId, invitation.userId),
            isNull(setupTokens.consumedAt),
          ),
        );
      await tx
        .update(authUsers)
        .set({ status: "suspended", updatedAt: now })
        .where(eq(authUsers.id, invitation.userId));
      const [updated] = await tx
        .update(authInvitations)
        .set({
          state: "cancelled",
          cancelledAt: now,
          updatedAt: now,
          failureCode: null,
        })
        .where(eq(authInvitations.id, invitationId))
        .returning();
      if (!updated) throw new Error("Invitation not found");
      return updated;
    });
    await this.audit.append({
      actorUserId,
      action: "auth.invitation.cancelled",
      targetType: "invitation",
      targetId: invitationId,
    });
    return cancelled;
  }

  async list(): Promise<AuthInvitation[]> {
    await this.reconcileExpired();
    return this.db
      .select()
      .from(authInvitations)
      .orderBy(authInvitations.createdAt, sql`rowid`);
  }

  async listWithCurrentSetupExpirations(): Promise<{
    invitations: AuthInvitation[];
    expirations: Map<string, number>;
  }> {
    await this.reconcileExpired();
    const [invitations, expirationRows] = await Promise.all([
      this.db
        .select()
        .from(authInvitations)
        .orderBy(authInvitations.createdAt, sql`rowid`),
      this.db
        .select({
          invitationId: authInvitations.id,
          expiresAt: setupTokens.expiresAt,
        })
        .from(authInvitations)
        .innerJoin(
          setupTokens,
          eq(setupTokens.tokenHash, authInvitations.currentSetupTokenHash),
        ),
    ]);
    return {
      invitations,
      expirations: new Map(
        expirationRows.map((row) => [row.invitationId, row.expiresAt * 1_000]),
      ),
    };
  }

  listDeliveryAttempts(
    invitationId: string,
  ): Promise<AuthInvitationDeliveryAttempt[]> {
    return this.db
      .select()
      .from(authInvitationDeliveryAttempts)
      .where(eq(authInvitationDeliveryAttempts.invitationId, invitationId))
      .orderBy(authInvitationDeliveryAttempts.queuedAt, sql`rowid`);
  }

  private async reconcileExpired(): Promise<void> {
    const now = Date.now();
    const nowSeconds = Math.floor(now / 1000);
    const expired = await this.db
      .select({
        invitationId: authInvitations.id,
        tokenHash: setupTokens.tokenHash,
      })
      .from(authInvitations)
      .innerJoin(
        setupTokens,
        eq(setupTokens.tokenHash, authInvitations.currentSetupTokenHash),
      )
      .where(
        and(
          inArray(authInvitations.state, [
            "pending",
            "sending",
            "sent",
            "failed",
          ]),
          lte(setupTokens.expiresAt, nowSeconds),
        ),
      );
    for (const item of expired) {
      await this.db.transaction(async (tx) => {
        await tx
          .update(setupTokens)
          .set({ consumedAt: nowSeconds })
          .where(
            and(
              eq(setupTokens.tokenHash, item.tokenHash),
              isNull(setupTokens.consumedAt),
            ),
          );
        await tx
          .update(authInvitations)
          .set({
            state: "expired",
            expiredAt: now,
            updatedAt: now,
            failureCode: null,
          })
          .where(eq(authInvitations.id, item.invitationId));
      });
      await this.audit.append({
        action: "auth.invitation.expired",
        targetType: "invitation",
        targetId: item.invitationId,
      });
    }
  }

  private async createOrReplay(
    input: CreateInvitationInput,
    keyHash: string,
  ): Promise<CreateInvitationResult> {
    const existing = await this.getByIdempotencyKey(keyHash);
    if (existing) return existing;
    const deliveryMode = input.delivery.mode ?? "automatic";
    await this.ensureDeliveryModeAvailable(input.delivery.type, deliveryMode);
    this.validateDeliverySubject(input.delivery.type, input.delivery.subject);

    let created: CreatedInvitation;
    try {
      created = await this.createDurableInvitation(input, keyHash);
    } catch (error) {
      const replay = await this.getByIdempotencyKey(keyHash);
      if (replay) return replay;
      throw error;
    }

    await this.audit.append({
      actorUserId: input.actorUserId,
      action: "auth.invitation.created",
      targetType: "invitation",
      targetId: created.invitation.id,
      metadata: {
        userId: created.user.id,
        role: created.user.role,
        deliveryType: input.delivery.type,
      },
    });
    const invitation =
      created.deliveryMode === "manual"
        ? created.invitation
        : await this.deliver(created);
    return {
      invitation,
      user: created.user,
      ...(created.peer ? { peer: created.peer } : {}),
      registration: {
        setupUrl: invitationSetupUrl(this.issuer, created.setupToken),
        expiresAt: created.expiresAt,
        deliveryAttemptId: created.attempt.id,
      },
    };
  }

  private async createDurableInvitation(
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
    const expiresAt = Math.floor(now / 1000) + this.setupTokenTtlSeconds;

    return this.db.transaction(async (tx) => {
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

  private async recoverInterruptedDelivery(
    candidate: InterruptedDeliveryCandidate,
    staleBefore: number,
    now: number,
  ): Promise<CreatedInvitation | undefined> {
    const setupToken = `setup_${randomUUID()}`;
    const tokenHash = setupTokenId(setupToken);
    const nowSeconds = Math.floor(now / 1000);
    const expiresAt = nowSeconds + this.setupTokenTtlSeconds;

    return this.db.transaction(async (tx) => {
      const [attempt] = await tx
        .select()
        .from(authInvitationDeliveryAttempts)
        .where(eq(authInvitationDeliveryAttempts.id, candidate.attemptId))
        .limit(1);
      if (
        !attempt ||
        (attempt.state !== "queued" && attempt.state !== "sending") ||
        (attempt.state === "queued"
          ? attempt.queuedAt > staleBefore
          : attempt.startedAt === null || attempt.startedAt > staleBefore)
      ) {
        return undefined;
      }
      const [invitation] = await tx
        .select()
        .from(authInvitations)
        .where(eq(authInvitations.id, candidate.invitationId))
        .limit(1);
      if (
        !invitation ||
        (invitation.state !== "pending" && invitation.state !== "sending") ||
        invitation.currentSetupTokenHash !== attempt.setupTokenHash
      ) {
        return undefined;
      }
      const [user] = await tx
        .select()
        .from(authUsers)
        .where(eq(authUsers.id, invitation.userId))
        .limit(1);
      const [claim] = await tx
        .select()
        .from(authIdentities)
        .where(
          and(
            eq(authIdentities.id, invitation.deliveryClaimId),
            isNull(authIdentities.revokedAt),
          ),
        )
        .limit(1);
      if (
        user?.status !== "invited" ||
        !claim?.deliverySubject ||
        claim.type !== attempt.providerId
      ) {
        return undefined;
      }

      const [interruptedAttempt] = await tx
        .update(authInvitationDeliveryAttempts)
        .set({
          state: "failed",
          completedAt: now,
          failureCode: "delivery_interrupted",
        })
        .where(
          and(
            eq(authInvitationDeliveryAttempts.id, attempt.id),
            inArray(authInvitationDeliveryAttempts.state, [
              "queued",
              "sending",
            ]),
          ),
        )
        .returning();
      if (!interruptedAttempt) return undefined;

      await tx
        .update(setupTokens)
        .set({ consumedAt: nowSeconds })
        .where(
          and(
            eq(setupTokens.targetUserId, user.id),
            isNull(setupTokens.consumedAt),
          ),
        );
      await tx.insert(setupTokens).values({
        tokenHash,
        purpose: "passkey_setup",
        targetUserId: user.id,
        deliveryClaimId: claim.id,
        expiresAt,
        consumedAt: null,
        deliveryKeyHash: null,
        createdAt: nowSeconds,
      });
      const [recoveredInvitation] = await tx
        .update(authInvitations)
        .set({
          currentSetupTokenHash: tokenHash,
          state: "pending",
          failureCode: null,
          sentAt: null,
          expiredAt: null,
          updatedAt: now,
        })
        .where(eq(authInvitations.id, invitation.id))
        .returning();
      if (!recoveredInvitation) return undefined;
      const recoveryAttempt = {
        id: createPrefixedId("ida"),
        invitationId: invitation.id,
        setupTokenHash: tokenHash,
        providerId: attempt.providerId,
        providerDeliveryId: null,
        state: "queued" as const,
        failureCode: null,
        queuedAt: now,
        startedAt: null,
        completedAt: null,
      } satisfies typeof authInvitationDeliveryAttempts.$inferInsert;
      await tx.insert(authInvitationDeliveryAttempts).values(recoveryAttempt);
      const [peer] = await tx
        .select()
        .from(personExternalPeers)
        .where(eq(personExternalPeers.personId, user.personId))
        .limit(1);

      return {
        invitation: recoveredInvitation,
        user,
        ...(peer ? { peer } : {}),
        attempt: recoveryAttempt,
        recipient: claim.deliverySubject,
        setupToken,
        expiresAt,
        deliveryMode: "automatic",
      };
    });
  }

  private async deliver(created: CreatedInvitation): Promise<AuthInvitation> {
    const startedAt = Date.now();
    const started = await this.db.transaction(async (tx) => {
      const [startedAttempt] = await tx
        .update(authInvitationDeliveryAttempts)
        .set({ state: "sending", startedAt, failureCode: null })
        .where(
          and(
            eq(authInvitationDeliveryAttempts.id, created.attempt.id),
            eq(authInvitationDeliveryAttempts.state, "queued"),
          ),
        )
        .returning();
      if (!startedAttempt) return false;

      const [sendingInvitation] = await tx
        .update(authInvitations)
        .set({ state: "sending", updatedAt: startedAt, failureCode: null })
        .where(
          and(
            eq(authInvitations.id, created.invitation.id),
            eq(
              authInvitations.currentSetupTokenHash,
              created.attempt.setupTokenHash,
            ),
            eq(authInvitations.state, "pending"),
          ),
        )
        .returning();
      if (sendingInvitation) return true;

      await tx
        .update(authInvitationDeliveryAttempts)
        .set({
          state: "failed",
          completedAt: startedAt,
          failureCode: "invitation_unavailable",
        })
        .where(eq(authInvitationDeliveryAttempts.id, created.attempt.id));
      return false;
    });
    if (!started) return this.requireInvitation(created.invitation.id);

    const result = await this.deliverWithProvider(created);
    const completedAt = Date.now();

    if (result.status === "sent") {
      const completion = await this.db.transaction(async (tx) => {
        const [completedAttempt] = await tx
          .update(authInvitationDeliveryAttempts)
          .set({
            state: "sent",
            completedAt,
            providerDeliveryId: result.providerDeliveryId ?? null,
            failureCode: null,
          })
          .where(
            and(
              eq(authInvitationDeliveryAttempts.id, created.attempt.id),
              eq(authInvitationDeliveryAttempts.state, "sending"),
            ),
          )
          .returning();
        if (!completedAttempt) {
          return { attemptCompleted: false, invitationUpdated: false };
        }

        const [sentInvitation] = await tx
          .update(authInvitations)
          .set({
            state: "sent",
            sentAt: completedAt,
            updatedAt: completedAt,
            failureCode: null,
          })
          .where(
            and(
              eq(authInvitations.id, created.invitation.id),
              eq(
                authInvitations.currentSetupTokenHash,
                created.attempt.setupTokenHash,
              ),
              eq(authInvitations.state, "sending"),
            ),
          )
          .returning();
        if (sentInvitation) {
          await tx.insert(setupTokenDeliveries).values({
            tokenHash: created.attempt.setupTokenHash,
            recipientHash: setupDeliveryRecipientHash(created.recipient),
            deliveredAt: Math.floor(completedAt / 1000),
            deliveryId: result.providerDeliveryId ?? null,
          });
        }
        return {
          attemptCompleted: true,
          invitationUpdated: Boolean(sentInvitation),
        };
      });
      await this.audit.append({
        action: completion.invitationUpdated
          ? "auth.invitation.sent"
          : completion.attemptCompleted
            ? "auth.invitation.delivery_completed_after_terminal"
            : "auth.invitation.delivery_result_ignored",
        targetType: "invitation",
        targetId: created.invitation.id,
        metadata: { deliveryType: created.attempt.providerId },
      });
    } else {
      const failureCode = result.failureCode;
      const completion = await this.db.transaction(async (tx) => {
        const [failedAttempt] = await tx
          .update(authInvitationDeliveryAttempts)
          .set({ state: "failed", completedAt, failureCode })
          .where(
            and(
              eq(authInvitationDeliveryAttempts.id, created.attempt.id),
              eq(authInvitationDeliveryAttempts.state, "sending"),
            ),
          )
          .returning();
        if (!failedAttempt) return false;

        await tx
          .update(authInvitations)
          .set({ state: "failed", updatedAt: completedAt, failureCode })
          .where(
            and(
              eq(authInvitations.id, created.invitation.id),
              eq(
                authInvitations.currentSetupTokenHash,
                created.attempt.setupTokenHash,
              ),
              eq(authInvitations.state, "sending"),
            ),
          );
        return true;
      });
      await this.audit.append({
        action: completion
          ? "auth.invitation.delivery_failed"
          : "auth.invitation.delivery_result_ignored",
        targetType: "invitation",
        targetId: created.invitation.id,
        metadata: { deliveryType: created.attempt.providerId, failureCode },
      });
    }

    return this.requireInvitation(created.invitation.id);
  }

  private deliverWithProvider(
    created: CreatedInvitation,
  ): Promise<InvitationDeliveryResult> {
    const provider = this.getDeliveryProvider?.(created.attempt.providerId);
    if (!provider) {
      return Promise.resolve({
        status: "failed",
        failureCode: "delivery_provider_unavailable",
      });
    }
    const setupUrl = invitationSetupUrl(this.issuer, created.setupToken);
    return provider.send({
      recipient: created.recipient,
      subject: `Join ${new URL(this.issuer).hostname}`,
      text: [
        "You have been invited to access this brain.",
        "",
        `Set up your passkey: ${setupUrl}`,
        "",
        `This single-use link expires at ${new Date(created.expiresAt * 1000).toISOString()}.`,
      ].join("\n"),
      idempotencyKey: created.attempt.id,
    });
  }

  private async ensureDeliveryModeAvailable(
    channelType: string,
    deliveryMode: "automatic" | "manual",
  ): Promise<void> {
    const descriptor = this.getChannelDescriptor?.(channelType);
    if (this.getChannelDescriptor && !descriptor) {
      throw new Error(`Invitation channel is not registered: "${channelType}"`);
    }
    if (deliveryMode === "manual") {
      if (descriptor?.manualDelivery === true) return;
      throw new Error(
        `Manual invitation delivery is unavailable for channel: "${channelType}"`,
      );
    }
    if (await this.deliveryAvailable(channelType)) return;
    throw new Error("Invitation delivery provider is unavailable");
  }

  private validateDeliverySubject(channelType: string, subject: string): void {
    const pattern = this.getChannelDescriptor?.(channelType)?.subjectPattern;
    if (
      pattern &&
      !new RegExp(pattern.source, pattern.flags).test(subject.trim())
    ) {
      throw new Error(
        `Invitation delivery subject is invalid for channel: "${channelType}"`,
      );
    }
  }

  private async deliveryAvailable(providerId: string): Promise<boolean> {
    try {
      const provider = this.getDeliveryProvider?.(providerId);
      return provider ? await provider.isAvailable() : false;
    } catch {
      return false;
    }
  }

  private async getInvitationDelivery(invitationId: string): Promise<{
    channelType: string;
    deliveryMode: "automatic" | "manual";
  }> {
    const [delivery] = await this.db
      .select({
        type: authIdentities.type,
        providerId: authInvitationDeliveryAttempts.providerId,
      })
      .from(authInvitations)
      .innerJoin(
        authIdentities,
        eq(authIdentities.id, authInvitations.deliveryClaimId),
      )
      .innerJoin(
        authInvitationDeliveryAttempts,
        and(
          eq(authInvitationDeliveryAttempts.invitationId, authInvitations.id),
          eq(
            authInvitationDeliveryAttempts.setupTokenHash,
            authInvitations.currentSetupTokenHash,
          ),
        ),
      )
      .where(eq(authInvitations.id, invitationId))
      .limit(1);
    if (!delivery) throw new Error("Invitation not found");
    return {
      channelType: delivery.type,
      deliveryMode:
        delivery.providerId === MANUAL_DELIVERY_PROVIDER_ID
          ? "manual"
          : "automatic",
    };
  }

  private async getByIdempotencyKey(
    keyHash: string,
  ): Promise<CreateInvitationResult | undefined> {
    const [invitation] = await this.db
      .select()
      .from(authInvitations)
      .where(eq(authInvitations.idempotencyKeyHash, keyHash))
      .limit(1);
    if (!invitation) return undefined;
    const [user] = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, invitation.userId))
      .limit(1);
    if (!user) throw new Error("Invitation user is unavailable");
    const [peer] = await this.db
      .select()
      .from(personExternalPeers)
      .where(eq(personExternalPeers.personId, user.personId))
      .limit(1);
    return { invitation, user, ...(peer ? { peer } : {}) };
  }

  private async requireInvitation(
    invitationId: string,
  ): Promise<AuthInvitation> {
    const [invitation] = await this.db
      .select()
      .from(authInvitations)
      .where(eq(authInvitations.id, invitationId))
      .limit(1);
    if (!invitation) throw new Error("Invitation is unavailable");
    return invitation;
  }
}

function invitationIdempotencyKeyHash(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error("Invitation idempotency key is required");
  return sha256Hex(normalized);
}

function normalizeDeliverySubject(delivery: AuthSetupDeliveryInput): string {
  const subject = delivery.subject.trim();
  if (!subject) throw new Error("Invitation delivery subject is required");
  return subject;
}

function invitationSetupUrl(issuer: string, setupToken: string): string {
  return absoluteUrl(issuer, `/setup?token=${encodeURIComponent(setupToken)}`);
}
