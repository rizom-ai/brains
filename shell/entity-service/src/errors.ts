import { getErrorMessage } from "@brains/utils/error";
import { z } from "@brains/utils/zod";

const validationIssuesErrorSchema = z.looseObject({
  issues: z.array(
    z.looseObject({
      message: z.string(),
    }),
  ),
});

// Source runners and packed plugins can carry separate class copies.
const entityValidationErrorSchema = z.object({
  name: z.literal("EntityValidationError"),
  entityType: z.string(),
  originalError: z.unknown(),
});

export class EntityValidationError extends Error {
  public readonly entityType: string;
  public readonly originalError: unknown;
  public readonly phase: "schema" | "persist";

  constructor(
    entityType: string,
    originalError: unknown,
    phase: "schema" | "persist" = "schema",
  ) {
    super(
      `Invalid entity data for ${entityType}: ${getErrorMessage(originalError)}`,
    );
    this.name = "EntityValidationError";
    this.entityType = entityType;
    this.originalError = originalError;
    this.phase = phase;
  }
}

export function hasValidationIssues(error: unknown): boolean {
  return validationIssuesErrorSchema.safeParse(error).success;
}

export function isEntityValidationError(error: unknown): boolean {
  return (
    error instanceof EntityValidationError ||
    entityValidationErrorSchema.safeParse(error).success ||
    hasValidationIssues(error)
  );
}

export function toEntityValidationError(
  entityType: string,
  error: unknown,
  phase: "schema" | "persist" = "schema",
): EntityValidationError | undefined {
  if (error instanceof EntityValidationError) {
    return error.phase === phase
      ? error
      : new EntityValidationError(entityType, error.originalError, phase);
  }
  const wrapped = entityValidationErrorSchema.safeParse(error);
  if (wrapped.success)
    return new EntityValidationError(
      entityType,
      wrapped.data.originalError,
      phase,
    );
  return hasValidationIssues(error)
    ? new EntityValidationError(entityType, error, phase)
    : undefined;
}
