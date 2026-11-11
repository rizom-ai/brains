import { z } from "@brains/utils/zod";

/** null means create only if absent; a token means replace that incarnation. */
export const entityWriteConditionSchema: z.ZodObject<{
  expectedRevision: z.ZodNullable<z.ZodString>;
}> = z.object({
  expectedRevision: z.string().min(1).nullable(),
});

export type EntityWriteCondition = z.output<typeof entityWriteConditionSchema>;

export class EntityWriteConflictError extends Error {
  constructor(entityType: string, entityId: string) {
    super(`Entity write conflict: ${entityType}/${entityId}`);
    this.name = "EntityWriteConflictError";
  }
}
