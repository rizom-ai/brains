import type { BaseEntity } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils";

export interface CleanupResult {
  deleted: number;
  errors: Array<{ entityId: string; entityType: string; error: string }>;
}

interface CleanupLogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export function createCleanupResult(): CleanupResult {
  return { deleted: 0, errors: [] };
}

export function recordCleanupDeleted(
  logger: CleanupLogger,
  result: CleanupResult,
  entity: BaseEntity,
): void {
  result.deleted++;
  logger.debug("Deleted orphaned entity (file missing)", {
    entityType: entity.entityType,
    id: entity.id,
  });
}

export function recordCleanupError(
  logger: CleanupLogger,
  result: CleanupResult,
  entity: BaseEntity,
  error: unknown,
): void {
  const errorMessage = getErrorMessage(error);
  result.errors.push({
    entityId: entity.id,
    entityType: entity.entityType,
    error: errorMessage,
  });
  logger.error("Failed to delete orphaned entity", {
    entityType: entity.entityType,
    id: entity.id,
    error: errorMessage,
  });
}
