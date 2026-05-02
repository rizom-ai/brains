import type { ProgressReporter } from "@brains/utils";
import type { ExportResult, ImportResult } from "../types";
import type { ProgressOperations } from "./progress-operations";

export async function importDirectoryEntitiesWithProgress(
  progressOperations: ProgressOperations,
  paths: string[] | undefined,
  reporter: ProgressReporter,
  batchSize: number,
  importEntities: (paths: string[]) => Promise<ImportResult>,
): Promise<ImportResult> {
  return progressOperations.importEntitiesWithProgress(
    paths,
    reporter,
    batchSize,
    importEntities,
  );
}

export async function exportDirectoryEntitiesWithProgress(
  progressOperations: ProgressOperations,
  configuredEntityTypes: string[] | undefined,
  requestedEntityTypes: string[] | undefined,
  reporter: ProgressReporter,
  batchSize: number,
  exportEntities: (entityTypes: string[] | undefined) => Promise<ExportResult>,
): Promise<ExportResult> {
  const typesToExport = requestedEntityTypes ?? configuredEntityTypes;
  return progressOperations.exportEntitiesWithProgress(
    typesToExport,
    reporter,
    batchSize,
    exportEntities,
  );
}
