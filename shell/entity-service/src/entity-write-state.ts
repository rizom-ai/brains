import { and, eq } from "drizzle-orm";
import type { EntityDB } from "./db";
import { entities } from "./schema/entities";
import { entityWriteReceipts } from "./schema/entity-write-state";
import { entityRevision } from "./entity-revision";
import { normalizeEntityRow } from "./entity-data";
import {
  assertEntityWriteReceiptMatches,
  EntityWriteConflictError,
  type EntityWriteReceipt,
} from "./entity-write-contracts";

type WriteDatabase = Pick<EntityDB, "select" | "insert">;

/** Internal control flow: roll back a redundant transaction without emitting events. */
export class EntityWriteReplayed extends Error {}

export async function readEntityWriteReceipt(
  db: Pick<EntityDB, "select">,
  operationId: string,
): Promise<EntityWriteReceipt | null> {
  const rows = await db
    .select()
    .from(entityWriteReceipts)
    .where(eq(entityWriteReceipts.operationId, operationId))
    .limit(1);
  return rows[0] ?? null;
}

export async function hasMatchingEntityWriteReceipt(
  db: Pick<EntityDB, "select">,
  receipt: EntityWriteReceipt,
): Promise<boolean> {
  const existing = await readEntityWriteReceipt(db, receipt.operationId);
  if (!existing) return false;
  assertEntityWriteReceiptMatches(existing, receipt);
  return true;
}

/**
 * Must run in the same write transaction as the mutation and receipt. SQLite
 * serializes writers, so comparing the stored row's derived revision here is
 * the precondition; no separate SQL predicate is needed.
 */
export async function assertEntityWriteCondition(
  db: WriteDatabase,
  receipt: EntityWriteReceipt,
  entity: { entityType: string; id: string },
): Promise<void> {
  if (
    entity.entityType !== receipt.entityType ||
    entity.id !== receipt.entityId
  ) {
    throw new Error(
      "Entity validation changed the conditional write destination",
    );
  }
  if (await hasMatchingEntityWriteReceipt(db, receipt))
    throw new EntityWriteReplayed();
  const rows = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.entityType, receipt.entityType),
        eq(entities.id, receipt.entityId),
      ),
    )
    .limit(1);
  const current = rows[0];
  // Normalize as reads do, so both sides of the comparison hash the same row.
  const revision = current ? entityRevision(normalizeEntityRow(current)) : null;
  if (revision !== receipt.expectedRevision) {
    throw new EntityWriteConflictError(receipt.entityType, receipt.entityId);
  }
}

export async function recordEntityWriteReceipt(
  db: WriteDatabase,
  receipt: EntityWriteReceipt,
): Promise<void> {
  await db.insert(entityWriteReceipts).values(receipt);
}
