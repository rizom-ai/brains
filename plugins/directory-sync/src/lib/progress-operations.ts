import type { IEntityService } from "@brains/plugins";
import type { Logger, ProgressReporter } from "@brains/utils";
import type { ExportResult, ImportResult } from "../types";
import type { FileOperations } from "./file-operations";

/**
 * Handles import/export operations with progress reporting
 */
export class ProgressOperations {
  private readonly logger: Logger;
  private readonly entityService: IEntityService;
  private readonly fileOperations: FileOperations;

  constructor(
    logger: Logger,
    entityService: IEntityService,
    fileOperations: FileOperations,
  ) {
    this.logger = logger;
    this.entityService = entityService;
    this.fileOperations = fileOperations;
  }

  /**
   * Import entities with progress reporting
   */
  async importEntitiesWithProgress(
    paths: string[] | undefined,
    reporter: ProgressReporter,
    batchSize: number,
    importFn: (paths: string[]) => Promise<ImportResult>,
  ): Promise<ImportResult> {
    this.logger.debug("Importing entities with progress reporting");

    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      quarantined: 0,
      quarantinedFiles: [],
      errors: [],
      jobIds: [],
    };

    // Get all files to process
    const filesToProcess =
      paths ?? (await this.fileOperations.getAllSyncFiles());
    const totalFiles = filesToProcess.length;

    // Report initial progress
    await reporter.report({
      progress: 0,
      message: `Starting import of ${totalFiles} files`,
    });

    // Process in batches for progress reporting
    for (let i = 0; i < totalFiles; i += batchSize) {
      const batch = filesToProcess.slice(i, i + batchSize);

      // Process batch using provided import function
      const batchResult = await importFn(batch);

      // Accumulate results
      result.imported += batchResult.imported;
      result.skipped += batchResult.skipped;
      result.failed += batchResult.failed;
      result.quarantined += batchResult.quarantined;
      result.errors.push(...batchResult.errors);
      result.quarantinedFiles.push(...batchResult.quarantinedFiles);
      result.jobIds.push(...batchResult.jobIds);

      // Report progress
      const processed = Math.min(i + batchSize, totalFiles);
      const percentage = Math.round((processed / totalFiles) * 40); // Import is 0-40% of sync
      await reporter.report({
        progress: percentage,
        message: `Imported ${processed}/${totalFiles} files`,
      });
    }

    return result;
  }

  /**
   * Export entities with progress reporting
   */
  async exportEntitiesWithProgress(
    entityTypes: string[] | undefined,
    reporter: ProgressReporter,
    _batchSize: number,
    exportFn: (entityTypes: string[] | undefined) => Promise<ExportResult>,
  ): Promise<ExportResult> {
    this.logger.debug("Exporting entities with progress reporting");

    const typesToExport = entityTypes ?? this.entityService.getEntityTypes();

    await reporter.report({
      progress: 50,
      message: `Starting export of ${typesToExport.length} entity types`,
    });

    const result = await exportFn(entityTypes);

    await reporter.report({
      progress: 100,
      message: `Exported ${result.exported} entities`,
    });

    this.logger.debug("Export completed", result);
    return result;
  }
}
