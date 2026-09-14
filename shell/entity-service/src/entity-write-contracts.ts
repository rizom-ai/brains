import { z } from "@brains/utils/zod";

/** null means create only if absent; a token means replace that incarnation. */
export interface EntityWriteCondition {
  expectedRevision: string | null;
}

export const entityWriteConditionSchema: z.ZodType<
  EntityWriteCondition,
  unknown
> = z.object({
  expectedRevision: z.string().min(1).nullable(),
});

export class EntityWriteConflictError extends Error {
  constructor(entityType: string, entityId: string) {
    super(`Entity write conflict: ${entityType}/${entityId}`);
    this.name = "EntityWriteConflictError";
  }
}
