import type { BaseEntity } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { CleanupResult, ExportResult, ImportResult } from "../types";
import { removeOrphanedEntities as runCleanup } from "./cleanup-pipeline";
import type { DirectoryOperationDeps } from "./directory-operation-deps";
import {
  exportEntities as runExport,
  processEntityExport as runProcessEntityExport,
} from "./export-pipeline";
import { importEntities as runImport } from "./import-pipeline";

export async function processDirectoryEntityExport(
  operationDeps: DirectoryOperationDeps,
  deleteOnFileRemoval: boolean,
  entityTypes: string[] | undefined,
  entity: BaseEntity,
): Promise<{
  success: boolean;
  deleted?: boolean;
  error?: string;
}> {
  return runProcessEntityExport(
    operationDeps.createExportDeps(deleteOnFileRemoval, entityTypes),
    entity,
  );
}

export async function exportDirectoryEntities(
  operationDeps: DirectoryOperationDeps,
  deleteOnFileRemoval: boolean,
  configuredEntityTypes: string[] | undefined,
  requestedEntityTypes?: string[],
): Promise<ExportResult> {
  return runExport(
    operationDeps.createExportDeps(deleteOnFileRemoval, configuredEntityTypes),
    requestedEntityTypes,
  );
}

export async function importDirectoryEntities(
  operationDeps: DirectoryOperationDeps,
  entityTypes: string[] | undefined,
  paths?: string[],
): Promise<ImportResult> {
  return runImport(operationDeps.createImportDeps(entityTypes), paths);
}

export async function removeOrphanedDirectoryEntities(
  operationDeps: DirectoryOperationDeps,
  logger: Logger,
  deleteOnFileRemoval: boolean,
  entityTypes: string[] | undefined,
): Promise<CleanupResult> {
  const result = await runCleanup(
    operationDeps.createCleanupDeps(deleteOnFileRemoval, entityTypes),
  );

  if (result.deleted > 0) {
    logger.info("Cleaned up orphaned entities", {
      deleted: result.deleted,
    });
  }

  return result;
}
