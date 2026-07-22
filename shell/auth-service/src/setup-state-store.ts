import { sha256Hex } from "@brains/utils/hash";
import { JsonFileStore } from "./json-file-store";
import { z } from "@brains/utils/zod";
import { join } from "node:path";
import { and, eq, gt, isNull } from "drizzle-orm";
import { AuthAuditStore } from "./audit-store";
import type { AuthRuntimeDatabase } from "./runtime-db";
import { setupTokenDeliveries, setupTokens } from "./runtime-schema";

const DEFAULT_SETUP_STATE_FILE = "oauth-setup-state.json";

export interface StoredSetupToken {
  token: string;
  expiresAt: number;
}

export interface StoredSetupDelivery {
  setupTokenId: string;
  recipientHash: string;
  deliveredAt: number;
  deliveryId?: string;
}

export interface SetupStateFile {
  setupToken?: StoredSetupToken;
  deliveries: StoredSetupDelivery[];
}

export interface SetupStateStoreOptions {
  storageDir: string;
  storeFile?: string;
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

const storedSetupTokenSchema = z.looseObject({
  token: z.string(),
  expiresAt: z.number(),
});

const storedSetupDeliverySchema = z
  .looseObject({
    setupTokenId: z.string(),
    recipientHash: z.string(),
    deliveredAt: z.number(),
    deliveryId: z.string().optional(),
  })
  .transform((delivery): StoredSetupDelivery => ({
    setupTokenId: delivery.setupTokenId,
    recipientHash: delivery.recipientHash,
    deliveredAt: delivery.deliveredAt,
    ...(delivery.deliveryId !== undefined
      ? { deliveryId: delivery.deliveryId }
      : {}),
  }));

const setupStateFileSchema = z.looseObject({
  setupToken: z.unknown().optional(),
  deliveries: z.array(z.unknown()).optional(),
});

function emptyState(): SetupStateFile {
  return { deliveries: [] };
}

function parseStoreFile(value: unknown): SetupStateFile {
  const parsed = setupStateFileSchema.safeParse(value);
  if (!parsed.success) return emptyState();

  const setupToken = storedSetupTokenSchema.safeParse(parsed.data.setupToken);
  return {
    ...(setupToken.success ? { setupToken: setupToken.data } : {}),
    deliveries: parsed.data.deliveries?.flatMap(parseStoredSetupDelivery) ?? [],
  };
}

function parseStoredSetupDelivery(value: unknown): StoredSetupDelivery[] {
  const parsed = storedSetupDeliverySchema.safeParse(value);
  return parsed.success ? [parsed.data] : [];
}

const PASSKEY_SETUP_PURPOSE = "passkey_setup";

export class RuntimeSetupStateStore implements TargetedSetupStatePersistence {
  private readonly database: AuthRuntimeDatabase;
  private revealableToken: StoredSetupToken | undefined;

  constructor(database: AuthRuntimeDatabase) {
    this.database = database;
  }

  async importState(state: SetupStateFile): Promise<boolean> {
    const setupToken = state.setupToken;
    if (!setupToken) return false;
    const tokenHash = setupTokenId(setupToken.token);
    const imported = await this.database.db.transaction(async (tx) => {
      const insertedTokens = await tx
        .insert(setupTokens)
        .values({
          tokenHash,
          purpose: PASSKEY_SETUP_PURPOSE,
          targetUserId: null,
          deliveryClaimId: null,
          expiresAt: setupToken.expiresAt,
          consumedAt: null,
          deliveryKeyHash: null,
          createdAt: Math.floor(Date.now() / 1000),
        })
        .onConflictDoNothing()
        .returning({ tokenHash: setupTokens.tokenHash });
      const deliveries = state.deliveries.filter(
        (delivery) => delivery.setupTokenId === tokenHash,
      );
      const insertedDeliveries =
        deliveries.length > 0
          ? await tx
              .insert(setupTokenDeliveries)
              .values(
                deliveries.map((delivery) => ({
                  tokenHash,
                  recipientHash: delivery.recipientHash,
                  deliveredAt: delivery.deliveredAt,
                  deliveryId: delivery.deliveryId ?? null,
                })),
              )
              .onConflictDoNothing()
              .returning({ tokenHash: setupTokenDeliveries.tokenHash })
          : [];
      return {
        tokenInserted: insertedTokens.length > 0,
        deliveriesInserted: insertedDeliveries.length > 0,
      };
    });
    if (imported.tokenInserted) {
      this.revealableToken = setupToken;
    }
    return imported.tokenInserted || imported.deliveriesInserted;
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

export class SetupStateStore implements SetupStatePersistence {
  private readonly store: JsonFileStore<SetupStateFile>;
  private loaded: SetupStateFile | undefined;

  constructor(options: SetupStateStoreOptions) {
    this.store = new JsonFileStore({
      filePath: join(
        options.storageDir,
        options.storeFile ?? DEFAULT_SETUP_STATE_FILE,
      ),
      parse: parseStoreFile,
      empty: emptyState,
      // Empty setup state can read as "this brain is unclaimed", so a
      // corrupt file must halt instead of starting empty.
      onCorrupt: "throw",
    });
  }

  async getMigrationState(): Promise<SetupStateFile> {
    return this.ensureLoaded();
  }

  async getValidSetupToken(
    nowSeconds: number,
  ): Promise<StoredSetupToken | undefined> {
    const state = await this.ensureLoaded();
    if (!state.setupToken) return undefined;
    if (state.setupToken.expiresAt <= nowSeconds) {
      delete state.setupToken;
      state.deliveries = [];
      await this.store.enqueueWrite(() => this.store.write(state));
      return undefined;
    }
    return state.setupToken;
  }

  async hasActiveSetupToken(nowSeconds: number): Promise<boolean> {
    return Boolean(await this.getValidSetupToken(nowSeconds));
  }

  async hasActiveSetupDelivery(nowSeconds: number): Promise<boolean> {
    const state = await this.ensureLoaded();
    const token = await this.getValidSetupToken(nowSeconds);
    return Boolean(
      token &&
      state.deliveries.some(
        (delivery) => delivery.setupTokenId === setupTokenId(token.token),
      ),
    );
  }

  async hasValidSetupToken(
    token: string,
    nowSeconds: number,
  ): Promise<boolean> {
    return (await this.getValidSetupToken(nowSeconds))?.token === token;
  }

  async saveSetupToken(setupToken: StoredSetupToken): Promise<void> {
    const state = await this.ensureLoaded();
    const activeSetupTokenId = setupTokenId(setupToken.token);
    state.setupToken = setupToken;
    state.deliveries = state.deliveries.filter(
      (delivery) => delivery.setupTokenId === activeSetupTokenId,
    );
    await this.store.enqueueWrite(() => this.store.write(state));
  }

  async clearSetupState(): Promise<void> {
    this.loaded = emptyState();
    await this.store.enqueueWrite(() =>
      this.store.write(this.loaded ?? emptyState()),
    );
  }

  async hasDelivery(
    setupTokenIdValue: string,
    recipient: string,
  ): Promise<boolean> {
    const state = await this.ensureLoaded();
    const recipientHashValue = setupDeliveryRecipientHash(recipient);
    return state.deliveries.some(
      (delivery) =>
        delivery.setupTokenId === setupTokenIdValue &&
        delivery.recipientHash === recipientHashValue,
    );
  }

  async recordDelivery(
    setupTokenIdValue: string,
    recipient: string,
    options: RecordSetupDeliveryOptions = {},
  ): Promise<void> {
    const state = await this.ensureLoaded();
    if (await this.hasDelivery(setupTokenIdValue, recipient)) return;

    const delivery: StoredSetupDelivery = {
      setupTokenId: setupTokenIdValue,
      recipientHash: setupDeliveryRecipientHash(recipient),
      deliveredAt: Math.floor(Date.now() / 1000),
      ...(options.deliveryId ? { deliveryId: options.deliveryId } : {}),
    };
    state.deliveries.push(delivery);
    await this.store.enqueueWrite(() => this.store.write(state));
  }

  private async ensureLoaded(): Promise<SetupStateFile> {
    this.loaded ??= await this.store.read();
    return this.loaded;
  }
}
