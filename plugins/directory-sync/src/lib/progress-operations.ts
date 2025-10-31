import type { IEntityService, ProgressReporter, Logger } from "@brains/plugins";
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
    const filesToProcess = paths ?? this.fileOperations.getAllMarkdownFiles();
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
      result.errors.push(...batchResult.errors);
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
    batchSize: number,
  ): Promise<ExportResult> {
    this.logger.debug("Exporting entities with progress reporting");

    const typesToExport = entityTypes ?? this.entityService.getEntityTypes();
    const result: ExportResult = {
      exported: 0,
      failed: 0,
      errors: [],
    };

    const totalTypes = typesToExport.length;

    // Report initial progress
    await reporter.report({
      progress: 50, // Export starts at 50%
      message: `Starting export of ${totalTypes} entity types`,
    });

    // Process each entity type
    for (let typeIndex = 0; typeIndex < totalTypes; typeIndex++) {
      const entityType = typesToExport[typeIndex];
      if (!entityType) continue;

      const entities = await this.entityService.listEntities(entityType, {
        limit: 1000,
      });

      // Process entities in batches
      for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);

        for (const entity of batch) {
          try {
            await this.fileOperations.writeEntity(entity);
            result.exported++;
            this.logger.debug("Exported entity", { entityType, id: entity.id });
          } catch (error) {
            const exportError =
              error instanceof Error
                ? error
                : new Error(
                    `Failed to export entity ${entity.id || "unknown"}`,
                  );
            result.failed++;
            result.errors.push({
              entityId: entity.id || "unknown",
              entityType,
              error: exportError.message,
            });
            this.logger.error("Failed to export entity", {
              entityType,
              id: entity.id || "unknown",
              error: exportError,
            });
          }
        }

        // Report progress for this batch
        const typeProgress = (typeIndex + 1) / totalTypes;
        const overallProgress = 50 + Math.round(typeProgress * 50); // Export is 50-100%
        await reporter.report({
          progress: overallProgress,
          message: `Exported ${result.exported} entities`,
        });
      }
    }

    this.logger.debug("Export completed", result);
    return result;
  }
}
