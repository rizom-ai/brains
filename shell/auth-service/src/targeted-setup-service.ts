import { createPrefixedId } from "@brains/utils/id";
import { and, eq, gt, isNotNull, isNull } from "drizzle-orm";
import type { AuthIdentityRecord, AuthIdentityStore } from "./identity-store";
import type { AuthRuntimeDB } from "./runtime-db";
import {
  authIdentities,
  authIdentityEvidence,
  authUsers,
  setupTokenDeliveries,
  setupTokens,
  type AuthIdentity,
  type AuthUser,
} from "./runtime-schema";
import { setupDeliveryRecipientHash } from "./setup-state-store";

export interface CompleteTargetedSetupInput {
  userId: string;
  setupTokenId: string;
}

export interface CompletedTargetedSetup {
  user: AuthUser;
  boundIdentity?: AuthIdentityRecord;
}

export class TargetedSetupService {
  private readonly db: AuthRuntimeDB;
  private readonly identityStore: AuthIdentityStore;

  constructor(db: AuthRuntimeDB, identityStore: AuthIdentityStore) {
    this.db = db;
    this.identityStore = identityStore;
  }

  async validate(input: CompleteTargetedSetupInput): Promise<void> {
    await requireTargetedSetupContext(this.db, input);
  }

  async complete(
    input: CompleteTargetedSetupInput,
  ): Promise<CompletedTargetedSetup> {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const now = Date.now();
    const boundIdentityId = await this.db.transaction(async (tx) => {
      const context = await requireTargetedSetupContext(tx, input);
      const claim = context.deliveryClaim;

      if (claim) {
        const [verifiedEvidence] = await tx
          .select({ id: authIdentityEvidence.id })
          .from(authIdentityEvidence)
          .where(
            and(
              eq(authIdentityEvidence.claimId, claim.id),
              eq(authIdentityEvidence.assurance, "verified"),
              isNotNull(authIdentityEvidence.verifiedAt),
            ),
          )
          .limit(1);
        if (!verifiedEvidence) {
          await tx.insert(authIdentityEvidence).values({
            id: createPrefixedId("aev"),
            claimId: claim.id,
            sourceKind: "provider",
            sourceId: null,
            assurance: "verified",
            verifiedAt: now,
            createdAt: now,
          });
        }
      }

      if (context.user.status === "invited") {
        await tx
          .update(authUsers)
          .set({ status: "active", updatedAt: now })
          .where(eq(authUsers.id, context.user.id));
      }
      const consumed = await tx
        .update(setupTokens)
        .set({ consumedAt: nowSeconds })
        .where(
          and(
            eq(setupTokens.tokenHash, input.setupTokenId),
            isNull(setupTokens.consumedAt),
          ),
        )
        .returning({ tokenHash: setupTokens.tokenHash });
      if (consumed.length !== 1) {
        throw new Error("Invalid or consumed setup token");
      }
      return claim?.id;
    });

    return {
      user: await this.requireUser(input.userId),
      ...(boundIdentityId
        ? {
            boundIdentity:
              await this.identityStore.getIdentity(boundIdentityId),
          }
        : {}),
    };
  }

  private async requireUser(userId: string): Promise<AuthUser> {
    const [user] = await this.db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, userId))
      .limit(1);
    if (!user) throw new Error(`Auth user not found: ${userId}`);
    return user;
  }
}

async function requireTargetedSetupContext(
  db: Pick<AuthRuntimeDB, "select">,
  input: CompleteTargetedSetupInput,
): Promise<{ user: AuthUser; deliveryClaim?: AuthIdentity }> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const [setup] = await db
    .select()
    .from(setupTokens)
    .where(
      and(
        eq(setupTokens.tokenHash, input.setupTokenId),
        eq(setupTokens.purpose, "passkey_setup"),
        eq(setupTokens.targetUserId, input.userId),
        isNull(setupTokens.consumedAt),
        gt(setupTokens.expiresAt, nowSeconds),
      ),
    )
    .limit(1);
  if (!setup) throw new Error("Invalid or consumed setup token");

  const [user] = await db
    .select()
    .from(authUsers)
    .where(eq(authUsers.id, input.userId))
    .limit(1);
  if (!user || user.status === "suspended") {
    throw new Error("Passkey registration user is unavailable");
  }
  if (!setup.deliveryClaimId) return { user };

  const [claim] = await db
    .select()
    .from(authIdentities)
    .where(
      and(
        eq(authIdentities.id, setup.deliveryClaimId),
        isNull(authIdentities.revokedAt),
      ),
    )
    .limit(1);
  if (!claim) throw new Error("Setup delivery identity is unavailable");
  if (claim.personId !== user.personId) {
    throw new Error("Setup delivery identity does not belong to target user");
  }
  if (
    (claim.type !== "email" && claim.type !== "discord") ||
    !claim.deliverySubject
  ) {
    throw new Error("Setup delivery identity is unavailable");
  }

  const [delivery] = await db
    .select({ tokenHash: setupTokenDeliveries.tokenHash })
    .from(setupTokenDeliveries)
    .where(
      and(
        eq(setupTokenDeliveries.tokenHash, input.setupTokenId),
        eq(
          setupTokenDeliveries.recipientHash,
          setupDeliveryRecipientHash(claim.deliverySubject),
        ),
      ),
    )
    .limit(1);
  if (!delivery) throw new Error("Setup delivery was not confirmed");
  return { user, deliveryClaim: claim };
}
