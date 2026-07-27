import { randomUUID } from "node:crypto";
import { sha256Hex } from "@brains/utils/hash";
import { createPrefixedId } from "@brains/utils/id";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
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

export interface InvitationEmailInput {
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
}

export type InvitationEmailResult =
  | { status: "sent"; deliveryId?: string }
  | { status: "failed"; failureCode?: string };

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
  registration?: { setupUrl: string; expiresAt: number };
}

export interface AuthInvitationServiceOptions {
  db: AuthRuntimeDB;
  issuer: string;
  setupTokenTtlSeconds: number;
  audit: AuthAuditStore;
  sendEmail?: (input: InvitationEmailInput) => Promise<InvitationEmailResult>;
}

interface CreatedInvitation {
  invitation: AuthInvitation;
  user: AuthUser;
  peer?: PersonExternalPeer;
  attempt: AuthInvitationDeliveryAttempt;
  recipient: string;
  setupToken: string;
  expiresAt: number;
}

export class AuthInvitationService {
  private readonly db: AuthRuntimeDB;
  private readonly issuer: string;
  private readonly setupTokenTtlSeconds: number;
  private readonly audit: AuthAuditStore;
  private readonly sendEmail:
    | ((input: InvitationEmailInput) => Promise<InvitationEmailResult>)
    | undefined;
  private readonly creations = new Map<
    string,
    Promise<CreateInvitationResult>
  >();

  constructor(options: AuthInvitationServiceOptions) {
    this.db = options.db;
    this.issuer = options.issuer;
    this.setupTokenTtlSeconds = options.setupTokenTtlSeconds;
    this.audit = options.audit;
    this.sendEmail = options.sendEmail;
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
      if (
        !claim?.deliverySubject ||
        (claim.type !== "email" && claim.type !== "discord")
      ) {
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
        providerId: claim.type,
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
      } satisfies CreatedInvitation;
    });

    await this.audit.append({
      actorUserId,
      action: "auth.invitation.resent",
      targetType: "invitation",
      targetId: invitationId,
    });
    const invitation = await this.deliver(created);
    return {
      invitation,
      user: created.user,
      ...(created.peer ? { peer: created.peer } : {}),
      registration: {
        setupUrl: invitationSetupUrl(this.issuer, setupToken),
        expiresAt,
      },
    };
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
    const invitation = await this.deliver(created);
    return {
      invitation,
      user: created.user,
      ...(created.peer ? { peer: created.peer } : {}),
      registration: {
        setupUrl: invitationSetupUrl(this.issuer, created.setupToken),
        expiresAt: created.expiresAt,
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
          input.delivery.type === "email"
            ? recipient
            : input.delivery.label.trim(),
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
        providerId: input.delivery.type,
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
      };
    });
  }

  private async deliver(created: CreatedInvitation): Promise<AuthInvitation> {
    const startedAt = Date.now();
    await this.db.transaction(async (tx) => {
      await tx
        .update(authInvitations)
        .set({ state: "sending", updatedAt: startedAt, failureCode: null })
        .where(eq(authInvitations.id, created.invitation.id));
      await tx
        .update(authInvitationDeliveryAttempts)
        .set({ state: "sending", startedAt, failureCode: null })
        .where(eq(authInvitationDeliveryAttempts.id, created.attempt.id));
    });

    const result =
      created.attempt.providerId === "email"
        ? await this.deliverEmail(created)
        : ({ status: "sent" } satisfies InvitationEmailResult);
    const completedAt = Date.now();

    if (result.status === "sent") {
      await this.db.transaction(async (tx) => {
        await tx
          .update(authInvitations)
          .set({
            state: "sent",
            sentAt: completedAt,
            updatedAt: completedAt,
            failureCode: null,
          })
          .where(eq(authInvitations.id, created.invitation.id));
        await tx
          .update(authInvitationDeliveryAttempts)
          .set({
            state: "sent",
            completedAt,
            providerDeliveryId: result.deliveryId ?? null,
            failureCode: null,
          })
          .where(eq(authInvitationDeliveryAttempts.id, created.attempt.id));
        await tx.insert(setupTokenDeliveries).values({
          tokenHash: created.invitation.currentSetupTokenHash,
          recipientHash: setupDeliveryRecipientHash(created.recipient),
          deliveredAt: Math.floor(completedAt / 1000),
          deliveryId: result.deliveryId ?? null,
        });
      });
      await this.audit.append({
        action: "auth.invitation.sent",
        targetType: "invitation",
        targetId: created.invitation.id,
        metadata: { deliveryType: created.attempt.providerId },
      });
    } else {
      const failureCode = result.failureCode ?? "delivery_failed";
      await this.db.transaction(async (tx) => {
        await tx
          .update(authInvitations)
          .set({ state: "failed", updatedAt: completedAt, failureCode })
          .where(eq(authInvitations.id, created.invitation.id));
        await tx
          .update(authInvitationDeliveryAttempts)
          .set({ state: "failed", completedAt, failureCode })
          .where(eq(authInvitationDeliveryAttempts.id, created.attempt.id));
      });
      await this.audit.append({
        action: "auth.invitation.delivery_failed",
        targetType: "invitation",
        targetId: created.invitation.id,
        metadata: { deliveryType: created.attempt.providerId, failureCode },
      });
    }

    return this.requireInvitation(created.invitation.id);
  }

  private deliverEmail(
    created: CreatedInvitation,
  ): Promise<InvitationEmailResult> {
    if (!this.sendEmail) {
      return Promise.resolve({
        status: "failed",
        failureCode: "email_delivery_unavailable",
      });
    }
    const setupUrl = invitationSetupUrl(this.issuer, created.setupToken);
    return this.sendEmail({
      to: created.recipient,
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
  return delivery.type === "email" ? subject.toLowerCase() : subject;
}

function invitationSetupUrl(issuer: string, setupToken: string): string {
  return absoluteUrl(issuer, `/setup?token=${encodeURIComponent(setupToken)}`);
}
