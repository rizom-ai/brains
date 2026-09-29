import { randomUUID } from "node:crypto";
import type {
  ChannelDeliveryInput,
  ChannelDeliveryProvider,
  ChannelDeliveryResult,
  ChannelDescriptor,
} from "@brains/plugins";
import { createPrefixedId } from "@brains/utils/id";
import { KeyedSingleFlight, SingleFlight } from "@brains/utils/serial-queue";
import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import type { AuthAuditStore } from "./audit-store";
import {
  authInvitationDeliveryAttempts,
  authInvitations,
  type AuthInvitation,
  type AuthInvitationDeliveryAttempt,
} from "./invitation-schema";
import { absoluteUrl } from "./issuer";
import { InvitationChannels } from "./invitation-channels";
import { invitationIdempotencyKeyHash } from "./invitation-keys";
import {
  listDeliveryAttempts,
  listInvitations,
  listInvitationsWithSetupExpirations,
} from "./invitation-queries";
import {
  createDurableInvitation,
  findByIdempotencyKey,
  MANUAL_DELIVERY_PROVIDER_ID,
  type CreatedInvitation,
  type CreateInvitationInput,
  type CreateInvitationResult,
} from "./invitation-store";

export type {
  CreateInvitationInput,
  CreateInvitationResult,
} from "./invitation-store";
import {
  isInterruptedDelivery,
  selectInterruptedDeliveries,
  staleDeliveryCutoff,
  type InterruptedDeliveryCandidate,
} from "./invitation-recovery";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authIdentities,
  authUsers,
  personExternalPeers,
  setupTokenDeliveries,
  setupTokens,
} from "./runtime-schema";
import { setupDeliveryRecipientHash, setupTokenId } from "./setup-state-store";

export type InvitationDeliveryInput = ChannelDeliveryInput;
export type InvitationDeliveryResult = ChannelDeliveryResult;

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

export class AuthInvitationService {
  private readonly db: AuthRuntimeDB;
  private readonly issuer: string;
  private readonly setupTokenTtlSeconds: number;
  private readonly audit: AuthAuditStore;
  private readonly deliveryRecoveryStaleMs: number;
  private readonly channels: InvitationChannels;
  private readonly creations = new KeyedSingleFlight<CreateInvitationResult>();
  private readonly manualConfirmations =
    new KeyedSingleFlight<AuthInvitation>();
  private readonly recovery = new SingleFlight<number>();

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
    this.channels = new InvitationChannels({
      issuer: options.issuer,
      ...(options.getDeliveryProvider
        ? { getDeliveryProvider: options.getDeliveryProvider }
        : {}),
      ...(options.getChannelDescriptor
        ? { getChannelDescriptor: options.getChannelDescriptor }
        : {}),
    });
  }

  create(input: CreateInvitationInput): Promise<CreateInvitationResult> {
    const keyHash = invitationIdempotencyKeyHash(input.idempotencyKey);
    return this.creations.run(keyHash, () =>
      this.createOrReplay(input, keyHash),
    );
  }

  async resend(
    invitationId: string,
    actorUserId: string,
  ): Promise<CreateInvitationResult> {
    const delivery = await this.getInvitationDelivery(invitationId);
    await this.channels.ensureModeAvailable(
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
    return this.manualConfirmations.run(key, () =>
      this.confirmManualDeliveryInternal(
        invitationId,
        deliveryAttemptId,
        actorUserId,
      ),
    );
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
    return this.recovery.run(() =>
      this.recoverInterruptedDeliveriesInternal(now),
    );
  }

  private async recoverInterruptedDeliveriesInternal(
    now: number,
  ): Promise<number> {
    const staleBefore = staleDeliveryCutoff(now, this.deliveryRecoveryStaleMs);
    const candidates = await selectInterruptedDeliveries(this.db, staleBefore);

    let recoveredCount = 0;
    for (const candidate of candidates) {
      if (
        candidate.attemptState !== "queued" &&
        candidate.attemptState !== "sending"
      ) {
        continue;
      }
      if (!(await this.channels.available(candidate.providerId))) continue;
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

  /** Reconciles expired invitations first, so the list never shows a dead link as pending. */
  async list(): Promise<AuthInvitation[]> {
    await this.reconcileExpired();
    return listInvitations(this.db);
  }

  /** As {@link list}, with the expiry of each invitation's current setup link. */
  async listWithCurrentSetupExpirations(): Promise<{
    invitations: AuthInvitation[];
    expirations: Map<string, number>;
  }> {
    await this.reconcileExpired();
    return listInvitationsWithSetupExpirations(this.db);
  }

  listDeliveryAttempts(
    invitationId: string,
  ): Promise<AuthInvitationDeliveryAttempt[]> {
    return listDeliveryAttempts(this.db, invitationId);
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
    const existing = await findByIdempotencyKey(this.db, keyHash);
    if (existing) return existing;
    const deliveryMode = input.delivery.mode ?? "automatic";
    await this.channels.ensureModeAvailable(input.delivery.type, deliveryMode);
    this.channels.validateSubject(input.delivery.type, input.delivery.subject);

    let created: CreatedInvitation;
    try {
      created = await createDurableInvitation(
        this.db,
        this.setupTokenTtlSeconds,
        input,
        keyHash,
      );
    } catch (error) {
      const replay = await findByIdempotencyKey(this.db, keyHash);
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
      // Re-asked inside the transaction: a candidate can progress between
      // being selected and being claimed here.
      if (!attempt || !isInterruptedDelivery(attempt, staleBefore)) {
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

    const result = await this.channels.send({
      providerId: created.attempt.providerId,
      recipient: created.recipient,
      setupToken: created.setupToken,
      expiresAtSeconds: created.expiresAt,
      idempotencyKey: created.attempt.id,
    });
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

function invitationSetupUrl(issuer: string, setupToken: string): string {
  return absoluteUrl(issuer, `/setup?token=${encodeURIComponent(setupToken)}`);
}
