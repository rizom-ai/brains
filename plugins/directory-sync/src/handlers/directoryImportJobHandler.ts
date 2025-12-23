import { z } from "@brains/utils";
import { BaseJobHandler } from "@brains/job-queue";
import type {
  Logger,
  ProgressReporter,
  ServicePluginContext,
} from "@brains/plugins";
import type { DirectorySync } from "../lib/directory-sync";
import type { ImportResult, DirectoryImportJobData } from "../types";

/**
 * Schema for directory import job data
 */
const directoryImportJobSchema = z.object({
  paths: z.array(z.string()).optional(),
  batchSize: z.number().min(1).optional().default(100),
  batchIndex: z.number().optional(),
});

/**
 * Job handler for async directory import operations
 * Processes file imports asynchronously with chunked processing
 */
export class DirectoryImportJobHandler extends BaseJobHandler<
  "directory-import",
  DirectoryImportJobData,
  ImportResult
> {
  private context: ServicePluginContext;
  private directorySync: DirectorySync;

  /**
   * Create a new instance of the job handler
   */
  constructor(
    logger: Logger,
    context: ServicePluginContext,
    directorySync: DirectorySync,
  ) {
    super(logger, { jobTypeName: "directory-import" });
    this.context = context;
    this.directorySync = directorySync;
  }

  /**
   * Process directory import job
   * Imports files in batches with progress tracking
   */
  public async process(
    data: DirectoryImportJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ImportResult> {
    this.logger.debug("Processing directory import job", { jobId, data });

    const startTime = Date.now();
    const result: ImportResult = {
      imported: 0,
      skipped: 0,
      failed: 0,
      quarantined: 0,
      quarantinedFiles: [],
      errors: [],
      jobIds: [],
    };

    try {
      // Get files to import
      const filesToImport =
        data.paths ?? this.directorySync.getAllMarkdownFiles();

      // Log start
      this.logger.debug("Starting import", {
        jobId,
        totalFiles: filesToImport.length,
      });

      // Report initial progress
      await progressReporter.report({
        message: `Starting import of ${filesToImport.length} files`,
        progress: 0,
        total: filesToImport.length,
      });

      // Process files in batches
      const batchSize = data.batchSize ?? 100;
      for (let i = 0; i < filesToImport.length; i += batchSize) {
        const batch = filesToImport.slice(i, i + batchSize);
        await this.importBatch(batch, jobId, result, i, filesToImport.length);

        // Report progress after each batch
        const processed = Math.min(i + batchSize, filesToImport.length);
        await progressReporter.report({
          message: `Imported ${processed}/${filesToImport.length} files (${result.imported} successful, ${result.failed} failed)`,
          progress: processed,
          total: filesToImport.length,
        });
      }

      // Log completion
      this.logger.debug("Import completed", {
        jobId,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
        duration: Date.now() - startTime,
      });

      this.logger.debug("Directory import job completed", {
        jobId,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      this.logger.error("Directory import job failed", { jobId, error });
      throw error;
    }
  }

  /**
   * Import a batch of files
   */
  private async importBatch(
    batch: string[],
    jobId: string,
    result: ImportResult,
    startIndex: number,
    totalFiles: number,
  ): Promise<void> {
    // Process batch in parallel
    const batchPromises = batch.map(async (filePath) => {
      try {
        const rawEntity = await this.directorySync.fileOps.readEntity(filePath);

        // Check if entity type is registered
        const entityTypes = this.context.entityService.getEntityTypes();
        if (!entityTypes.includes(rawEntity.entityType)) {
          result.skipped++;
          return { success: false, skipped: true };
        }

        // Try to deserialize and import
        try {
          const parsedEntity = this.context.entityService.deserializeEntity(
            rawEntity.content,
            rawEntity.entityType,
          );

          // Check if entity exists
          const existing = await this.context.entityService.getEntity(
            rawEntity.entityType,
            rawEntity.id,
          );

          if (existing) {
            // Update if modified
            const existingTime = new Date(existing.updated).getTime();
            const newTime = rawEntity.updated.getTime();
            if (existingTime < newTime) {
              const entityUpdate = {
                ...existing,
                content: rawEntity.content,
                ...parsedEntity,
                id: rawEntity.id,
                entityType: rawEntity.entityType,
                updated: rawEntity.updated.toISOString(),
              };
              await this.context.entityService.updateEntity(entityUpdate);
              result.imported++;
            } else {
              result.skipped++;
            }
          } else {
            // Create new entity
            const entityCreate = {
              id: rawEntity.id,
              entityType: rawEntity.entityType,
              content: rawEntity.content,
              ...parsedEntity,
              metadata: parsedEntity.metadata ?? {},
              created: rawEntity.created.toISOString(),
              updated: rawEntity.updated.toISOString(),
            };
            await this.context.entityService.createEntity(entityCreate);
            result.imported++;
          }
          return { success: true };
        } catch {
          // Deserialization failed
          result.skipped++;
          return { success: false, skipped: true };
        }
      } catch (error) {
        result.failed++;
        result.errors.push({
          path: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
        return { success: false, error };
      }
    });

    await Promise.all(batchPromises);

    // Log progress
    this.logger.debug("Import progress", {
      jobId,
      processed: startIndex + batch.length,
      total: totalFiles,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
    });
  }

  /**
   * Custom validateAndParse to clean up undefined optional properties
   * for exactOptionalPropertyTypes compliance
   */
  override validateAndParse(data: unknown): DirectoryImportJobData | null {
    try {
      const parsed = directoryImportJobSchema.parse(data);
      // Clean up undefined optional properties for exactOptionalPropertyTypes
      const result: DirectoryImportJobData = {};
      if (parsed.paths !== undefined) {
        result.paths = parsed.paths;
      }
      // batchSize always has a value due to .default(100) in schema
      result.batchSize = parsed.batchSize;
      if (parsed.batchIndex !== undefined) {
        result.batchIndex = parsed.batchIndex;
      }
      this.logger.debug(`${this.jobTypeName} job data validation successful`, {
        data: this.summarizeDataForLog(result),
      });
      return result;
    } catch (error) {
      this.logger.warn(`Invalid ${this.jobTypeName} job data`, {
        data,
        validationError: error instanceof z.ZodError ? error.issues : error,
      });
      return null;
    }
  }

  protected override summarizeDataForLog(
    data: DirectoryImportJobData,
  ): Record<string, unknown> {
    return {
      pathCount: data.paths?.length ?? "all",
      batchSize: data.batchSize,
    };
  }
}
