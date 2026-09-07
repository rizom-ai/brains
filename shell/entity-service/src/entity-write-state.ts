import { and, eq } from "drizzle-orm";
import type { EntityDB } from "./db";
import { entities } from "./schema/entities";
import { entityRevision } from "./entity-revision";
import { normalizeEntityRow } from "./entity-data";
import {
  EntityWriteConflictError,
  type EntityWriteCondition,
} from "./entity-write-contracts";

/** The destination a condition was declared for, fixed before validation. */
export interface EntityWritePrecondition extends EntityWriteCondition {
  entityType: string;
  entityId: string;
}

/**
 * Must run in the same write transaction as the mutation. SQLite serializes
 * writers, so comparing the stored row's derived revision here is the
 * precondition; no separate SQL predicate is needed.
 */
export async function assertEntityWriteCondition(
  db: Pick<EntityDB, "select">,
  precondition: EntityWritePrecondition,
  entity: { entityType: string; id: string },
): Promise<void> {
  if (
    entity.entityType !== precondition.entityType ||
    entity.id !== precondition.entityId
  ) {
    throw new Error(
      "Entity validation changed the conditional write destination",
    );
  }
  const rows = await db
    .select()
    .from(entities)
    .where(
      and(
        eq(entities.entityType, precondition.entityType),
        eq(entities.id, precondition.entityId),
      ),
    )
    .limit(1);
  const current = rows[0];
  // Normalize as reads do, so both sides of the comparison hash the same row.
  const revision = current ? entityRevision(normalizeEntityRow(current)) : null;
  if (revision !== precondition.expectedRevision) {
    throw new EntityWriteConflictError(
      precondition.entityType,
      precondition.entityId,
    );
  }
}
