import { z } from "zod";
import type { JobHandler } from "@brains/job-queue";
import type { Logger } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import type { DirectorySync } from "../lib/directory-sync";
import type { ImportResult } from "../types";

/**
 * Schema for directory import job data
 */
const directoryImportJobSchema = z.object({
  paths: z.array(z.string()).optional(),
  batchSize: z.number().min(1).default(100),
});

export type DirectoryImportJobData = z.infer<typeof directoryImportJobSchema>;

/**
 * Job handler for async directory import operations
 * Processes file imports asynchronously with chunked processing
 * Implements Component Interface Standardization pattern
 */
export class DirectoryImportJobHandler
  implements
    JobHandler<"directory-import", DirectoryImportJobData, ImportResult>
{
  private logger: Logger;
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
    this.logger = logger;
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
      errors: [],
    };

    try {
      // Get files to import
      const filesToImport =
        data.paths ?? this.directorySync.getAllMarkdownFiles();

      // Log start
      this.logger.info("Starting import", {
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
      const batchSize = data.batchSize;
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
      this.logger.info("Import completed", {
        jobId,
        imported: result.imported,
        skipped: result.skipped,
        failed: result.failed,
        duration: Date.now() - startTime,
      });

      this.logger.info("Directory import job completed", {
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
        const rawEntity = await this.directorySync.readEntity(filePath);

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
   * Handle import job errors
   */
  public async onError(
    error: Error,
    data: DirectoryImportJobData,
    jobId: string,
  ): Promise<void> {
    this.logger.error("Directory import job error handler called", {
      jobId,
      data,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    // Additional error handling could be added here
  }

  /**
   * Validate and parse import job data
   */
  public validateAndParse(data: unknown): DirectoryImportJobData | null {
    try {
      const result = directoryImportJobSchema.parse(data);
      this.logger.debug("Directory import job data validation successful", {
        data: result,
      });
      return result;
    } catch (error) {
      this.logger.warn("Invalid directory import job data", {
        data,
        validationError: error instanceof z.ZodError ? error.errors : error,
      });
      return null;
    }
  }
}
