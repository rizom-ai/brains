import { getErrorMessage } from "@brains/utils";
import { z } from "@brains/utils/zod";

const validationIssuesErrorSchema = z.looseObject({
  issues: z.array(
    z.looseObject({
      message: z.string(),
    }),
  ),
});

export class EntityValidationError extends Error {
  public readonly entityType: string;
  public readonly originalError: unknown;

  constructor(entityType: string, originalError: unknown) {
    super(
      `Invalid entity data for ${entityType}: ${getErrorMessage(originalError)}`,
    );
    this.name = "EntityValidationError";
    this.entityType = entityType;
    this.originalError = originalError;
  }
}

export function hasValidationIssues(error: unknown): boolean {
  return validationIssuesErrorSchema.safeParse(error).success;
}

export function isEntityValidationError(error: unknown): boolean {
  return error instanceof EntityValidationError || hasValidationIssues(error);
}

export function toEntityValidationError(
  entityType: string,
  error: unknown,
): EntityValidationError | undefined {
  if (error instanceof EntityValidationError) {
    return error;
  }
  return hasValidationIssues(error)
    ? new EntityValidationError(entityType, error)
    : undefined;
}
