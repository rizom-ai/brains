import { sha256Hex } from "@brains/utils/hash";
import { and, eq, gt, isNull } from "drizzle-orm";
import { AuthAuditStore } from "./audit-store";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { setupTokenDeliveries, setupTokens } from "./runtime-schema";

export interface StoredSetupToken {
  token: string;
  expiresAt: number;
}

export interface RecordSetupDeliveryOptions {
  deliveryId?: string;
}

export interface TargetedSetupTokenOptions {
  deliveryClaimId?: string;
}

export interface SetupStatePersistence {
  getValidSetupToken(nowSeconds: number): Promise<StoredSetupToken | undefined>;
  hasActiveSetupToken(nowSeconds: number): Promise<boolean>;
  hasActiveSetupDelivery(nowSeconds: number): Promise<boolean>;
  hasValidSetupToken(token: string, nowSeconds: number): Promise<boolean>;
  saveSetupToken(setupToken: StoredSetupToken): Promise<void>;
  clearSetupState(): Promise<void>;
  hasDelivery(setupTokenIdValue: string, recipient: string): Promise<boolean>;
  recordDelivery(
    setupTokenIdValue: string,
    recipient: string,
    options?: RecordSetupDeliveryOptions,
  ): Promise<void>;
}

export interface TargetedSetupStatePersistence extends SetupStatePersistence {
  saveTargetedSetupToken(
    setupToken: StoredSetupToken,
    targetUserId: string,
    options?: TargetedSetupTokenOptions,
  ): Promise<void>;
  getSetupTokenTarget(
    token: string,
    nowSeconds: number,
  ): Promise<
    { targetUserId: string | null; deliveryClaimId: string | null } | undefined
  >;
  consumeSetupToken(token: string): Promise<void>;
}

export function setupTokenId(token: string): string {
  return sha256Hex(token);
}

export function setupDeliveryRecipientHash(recipient: string): string {
  return sha256Hex(recipient.trim().toLowerCase());
}

const PASSKEY_SETUP_PURPOSE = "passkey_setup";

export class RuntimeSetupStateStore implements TargetedSetupStatePersistence {
  private readonly database: AuthRuntimeDatabase;
  private revealableToken: StoredSetupToken | undefined;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async getValidSetupToken(
    nowSecondsValue: number,
  ): Promise<StoredSetupToken | undefined> {
    const token = this.revealableToken;
    if (!token) return undefined;
    if (
      token.expiresAt <= nowSecondsValue ||
      !(await this.hasValidSetupToken(token.token, nowSecondsValue))
    ) {
      this.revealableToken = undefined;
      return undefined;
    }
    return token;
  }

  async hasActiveSetupToken(nowSecondsValue: number): Promise<boolean> {
    const [row] = await this.database.db
      .select({ tokenHash: setupTokens.tokenHash })
      .from(setupTokens)
      .where(
        and(
          eq(setupTokens.purpose, PASSKEY_SETUP_PURPOSE),
          isNull(setupTokens.targetUserId),
          isNull(setupTokens.consumedAt),
          gt(setupTokens.expiresAt, nowSecondsValue),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async hasActiveSetupDelivery(nowSecondsValue: number): Promise<boolean> {
    const [row] = await this.database.db
      .select({ tokenHash: setupTokens.tokenHash })
      .from(setupTokens)
      .innerJoin(
        setupTokenDeliveries,
        eq(setupTokenDeliveries.tokenHash, setupTokens.tokenHash),
      )
      .where(
        and(
          eq(setupTokens.purpose, PASSKEY_SETUP_PURPOSE),
          isNull(setupTokens.targetUserId),
          isNull(setupTokens.consumedAt),
          gt(setupTokens.expiresAt, nowSecondsValue),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async hasValidSetupToken(
    token: string,
    nowSecondsValue: number,
  ): Promise<boolean> {
    const [row] = await this.database.db
      .select({ tokenHash: setupTokens.tokenHash })
      .from(setupTokens)
      .where(
        and(
          eq(setupTokens.tokenHash, setupTokenId(token)),
          eq(setupTokens.purpose, PASSKEY_SETUP_PURPOSE),
          isNull(setupTokens.consumedAt),
          gt(setupTokens.expiresAt, nowSecondsValue),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async saveSetupToken(setupToken: StoredSetupToken): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(setupTokens)
        .set({ consumedAt: Math.floor(Date.now() / 1000) })
        .where(
          and(
            eq(setupTokens.purpose, PASSKEY_SETUP_PURPOSE),
            isNull(setupTokens.targetUserId),
            isNull(setupTokens.consumedAt),
          ),
        );
      await tx.insert(setupTokens).values({
        tokenHash: setupTokenId(setupToken.token),
        purpose: PASSKEY_SETUP_PURPOSE,
        targetUserId: null,
        deliveryClaimId: null,
        expiresAt: setupToken.expiresAt,
        consumedAt: null,
        deliveryKeyHash: null,
        createdAt: Math.floor(Date.now() / 1000),
      });
    });
    this.revealableToken = setupToken;
    await new AuthAuditStore(this.database.db).append({
      action: "auth.setup_token.generated",
      targetType: "setup_token",
      targetId: setupTokenId(setupToken.token),
      metadata: { expiresAt: setupToken.expiresAt },
    });
  }

  async saveTargetedSetupToken(
    setupToken: StoredSetupToken,
    targetUserId: string,
    options: TargetedSetupTokenOptions = {},
  ): Promise<void> {
    const now = Math.floor(Date.now() / 1000);
    await this.database.db.transaction(async (tx) => {
      await tx
        .update(setupTokens)
        .set({ consumedAt: now })
        .where(
          and(
            eq(setupTokens.purpose, PASSKEY_SETUP_PURPOSE),
            eq(setupTokens.targetUserId, targetUserId),
            isNull(setupTokens.consumedAt),
          ),
        );
      await tx.insert(setupTokens).values({
        tokenHash: setupTokenId(setupToken.token),
        purpose: PASSKEY_SETUP_PURPOSE,
        targetUserId,
        deliveryClaimId: options.deliveryClaimId ?? null,
        expiresAt: setupToken.expiresAt,
        consumedAt: null,
        deliveryKeyHash: null,
        createdAt: now,
      });
    });
  }

  async getSetupTokenTarget(
    token: string,
    nowSecondsValue: number,
  ): Promise<
    { targetUserId: string | null; deliveryClaimId: string | null } | undefined
  > {
    const [row] = await this.database.db
      .select({
        targetUserId: setupTokens.targetUserId,
        deliveryClaimId: setupTokens.deliveryClaimId,
      })
      .from(setupTokens)
      .where(
        and(
          eq(setupTokens.tokenHash, setupTokenId(token)),
          eq(setupTokens.purpose, PASSKEY_SETUP_PURPOSE),
          isNull(setupTokens.consumedAt),
          gt(setupTokens.expiresAt, nowSecondsValue),
        ),
      )
      .limit(1);
    return row;
  }

  async consumeSetupToken(token: string): Promise<void> {
    await this.database.db
      .update(setupTokens)
      .set({ consumedAt: Math.floor(Date.now() / 1000) })
      .where(
        and(
          eq(setupTokens.tokenHash, setupTokenId(token)),
          isNull(setupTokens.consumedAt),
        ),
      );
  }

  async clearSetupState(): Promise<void> {
    this.revealableToken = undefined;
    await this.database.db
      .update(setupTokens)
      .set({ consumedAt: Math.floor(Date.now() / 1000) })
      .where(
        and(
          eq(setupTokens.purpose, PASSKEY_SETUP_PURPOSE),
          isNull(setupTokens.targetUserId),
          isNull(setupTokens.consumedAt),
        ),
      );
  }

  async hasDelivery(
    setupTokenIdValue: string,
    recipient: string,
  ): Promise<boolean> {
    const [row] = await this.database.db
      .select({ tokenHash: setupTokenDeliveries.tokenHash })
      .from(setupTokenDeliveries)
      .where(
        and(
          eq(setupTokenDeliveries.tokenHash, setupTokenIdValue),
          eq(
            setupTokenDeliveries.recipientHash,
            setupDeliveryRecipientHash(recipient),
          ),
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  async recordDelivery(
    setupTokenIdValue: string,
    recipient: string,
    options: RecordSetupDeliveryOptions = {},
  ): Promise<void> {
    await this.database.db
      .insert(setupTokenDeliveries)
      .values({
        tokenHash: setupTokenIdValue,
        recipientHash: setupDeliveryRecipientHash(recipient),
        deliveredAt: Math.floor(Date.now() / 1000),
        deliveryId: options.deliveryId ?? null,
      })
      .onConflictDoNothing();
  }
}
