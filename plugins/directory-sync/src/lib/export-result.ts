import type { BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ExportResult } from "../types";

export interface EntityExportResult {
  success: boolean;
  deleted?: boolean;
  error?: string;
}

export function createExportResult(): ExportResult {
  return {
    exported: 0,
    failed: 0,
    errors: [],
  };
}

export function recordEntityExportResult(
  logger: Logger,
  result: ExportResult,
  entity: BaseEntity,
  exportResult: EntityExportResult,
): void {
  if (exportResult.success) {
    result.exported++;
    if (exportResult.deleted) {
      logger.debug("Deleted entity from DB (file missing)", {
        entityType: entity.entityType,
        id: entity.id,
      });
    }
    return;
  }

  result.failed++;
  result.errors.push({
    entityId: entity.id,
    entityType: entity.entityType,
    error: exportResult.error ?? "Unknown error",
  });
  logger.error("Failed to export entity", {
    entityType: entity.entityType,
    id: entity.id,
    error: exportResult.error,
  });
}

export function logExportSummary(logger: Logger, result: ExportResult): void {
  logger.debug("Export completed", result);
}
