import { z } from "@brains/utils/zod";

/** An operation ID identifies one immutable write intent across queue retries. */
export interface EntityWriteCondition {
  operationId: string;
  /** null means create only if absent; a token means replace that incarnation. */
  expectedRevision: string | null;
}

export const entityWriteConditionSchema: z.ZodType<
  EntityWriteCondition,
  unknown
> = z.object({
  operationId: z.string().min(1),
  expectedRevision: z.string().min(1).nullable(),
});

/** Evidence of a committed write, not a guarantee that its output still exists. */
export interface EntityWriteReceipt extends EntityWriteCondition {
  entityType: string;
  entityId: string;
}

export class EntityWriteConflictError extends Error {
  constructor(entityType: string, entityId: string) {
    super(`Entity write conflict: ${entityType}/${entityId}`);
    this.name = "EntityWriteConflictError";
  }
}

/** An operation ID was replayed with a different destination or precondition. */
export class EntityWriteIntentMismatchError extends Error {
  constructor(operationId: string) {
    super(
      `Entity write operation ${operationId} reused for a different intent`,
    );
    this.name = "EntityWriteIntentMismatchError";
  }
}

/** The one definition of "this receipt is a replay of that intent". */
export function assertEntityWriteReceiptMatches(
  existing: EntityWriteReceipt,
  expected: EntityWriteReceipt,
): void {
  if (
    existing.entityType !== expected.entityType ||
    existing.entityId !== expected.entityId ||
    existing.expectedRevision !== expected.expectedRevision
  ) {
    throw new EntityWriteIntentMismatchError(expected.operationId);
  }
}
