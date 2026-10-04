import { and, eq } from "drizzle-orm";
import type { EntityDB } from "./db";
import { entityMutationReceipts } from "./schema/entity-mutation-receipts";
import type { EntityTransaction } from "./projection-transaction-runner";
import {
  EntityMutationAlreadyAppliedError,
  entityMutationReceiptKeySchema,
  entityMutationReceiptSchema,
  type EntityMutationReceipt,
  type EntityMutationReceiptKey,
} from "./entity-mutation-receipt";

export class EntityMutationReceiptStore {
  private readonly db: EntityDB;
  constructor(db: EntityDB) {
    this.db = db;
  }

  async get(
    input: EntityMutationReceiptKey,
    db: Pick<EntityDB, "select"> = this.db,
  ): Promise<EntityMutationReceipt | null> {
    const key = entityMutationReceiptKeySchema.parse(input);
    const rows = await db
      .select()
      .from(entityMutationReceipts)
      .where(
        and(
          eq(entityMutationReceipts.namespace, key.namespace),
          eq(entityMutationReceipts.key, key.key),
        ),
      )
      .limit(1);
    return rows[0] ? entityMutationReceiptSchema.parse(rows[0].result) : null;
  }

  async assertVacant(
    transaction: EntityTransaction,
    key: EntityMutationReceiptKey,
  ): Promise<void> {
    const prior = await this.get(key, transaction);
    if (prior) throw new EntityMutationAlreadyAppliedError(prior);
  }

  async record(
    transaction: EntityTransaction,
    input: EntityMutationReceiptKey,
    result: EntityMutationReceipt,
  ): Promise<void> {
    const key = entityMutationReceiptKeySchema.parse(input);
    await transaction.insert(entityMutationReceipts).values({
      ...key,
      result: entityMutationReceiptSchema.parse(result),
      recordedAt: Date.now(),
    });
  }

  /** An atomic terminal decision with no content write competes for the same key. */
  async completeWithoutWrite(
    input: EntityMutationReceiptKey,
  ): Promise<EntityMutationReceipt> {
    const key = entityMutationReceiptKeySchema.parse(input);
    await this.db
      .insert(entityMutationReceipts)
      .values({
        ...key,
        result: { operation: "none" },
        recordedAt: Date.now(),
      })
      .onConflictDoNothing();
    const result = await this.get(key);
    if (!result) throw new Error("Missing committed entity mutation receipt");
    return result;
  }
}
