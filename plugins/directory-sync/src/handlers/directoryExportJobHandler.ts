import { z } from "zod";
import type { JobHandler } from "@brains/job-queue";
import type { Logger } from "@brains/utils";
import type { ServicePluginContext } from "@brains/plugins";
import type { ProgressReporter } from "@brains/utils";
import type { DirectorySync } from "../lib/directory-sync";
import type { ExportResult } from "../types";

/**
 * Schema for directory export job data
 */
const directoryExportJobSchema = z.object({
  entityTypes: z.array(z.string()).optional(),
  batchSize: z.number().min(1).default(100),
});

export type DirectoryExportJobData = z.infer<typeof directoryExportJobSchema>;

/**
 * Job handler for async directory export operations
 * Processes entity exports asynchronously with chunked processing
 * Implements Component Interface Standardization pattern
 */
export class DirectoryExportJobHandler
  implements
    JobHandler<"directory-export", DirectoryExportJobData, ExportResult>
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
   * Process directory export job
   * Exports entities in batches with progress tracking
   */
  public async process(
    data: DirectoryExportJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ExportResult> {
    this.logger.debug("Processing directory export job", { jobId, data });

    const startTime = Date.now();
    const result: ExportResult = {
      exported: 0,
      failed: 0,
      errors: [],
    };

    try {
      // Get entity types to export
      const typesToExport =
        data.entityTypes ?? this.context.entityService.getEntityTypes();

      // Log start
      this.logger.debug("Starting export", {
        jobId,
        entityTypes: typesToExport,
      });

      // Report initial progress
      await progressReporter.report({
        message: `Starting export of ${typesToExport.length} entity types`,
        progress: 0,
        total: typesToExport.length,
      });

      // Process each entity type
      for (const [index, entityType] of typesToExport.entries()) {
        await this.exportEntityType(entityType, data.batchSize, jobId, result);

        // Report progress after each entity type
        await progressReporter.report({
          message: `Exported ${index + 1}/${typesToExport.length} entity types (${result.exported} entities)`,
          progress: index + 1,
          total: typesToExport.length,
        });
      }

      // Log completion
      this.logger.debug("Export completed", {
        jobId,
        exported: result.exported,
        failed: result.failed,
        duration: Date.now() - startTime,
      });

      this.logger.debug("Directory export job completed", {
        jobId,
        exported: result.exported,
        failed: result.failed,
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      this.logger.error("Directory export job failed", { jobId, error });
      throw error;
    }
  }

  /**
   * Export entities of a specific type in batches
   */
  private async exportEntityType(
    entityType: string,
    batchSize: number,
    jobId: string,
    result: ExportResult,
  ): Promise<void> {
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      // Get batch of entities
      const entities = await this.context.entityService.listEntities(
        entityType,
        {
          limit: batchSize,
          offset,
        },
      );

      if (entities.length === 0) {
        hasMore = false;
        break;
      }

      // Process batch in parallel
      const batchPromises = entities.map(async (entity) => {
        try {
          await this.directorySync.writeEntity(entity);
          result.exported++;
          return { success: true };
        } catch (error) {
          result.failed++;
          result.errors.push({
            entityId: entity.id,
            entityType,
            error: error instanceof Error ? error.message : String(error),
          });
          return { success: false, error };
        }
      });

      // Process batch in parallel
      await Promise.all(batchPromises);

      // Log progress
      this.logger.debug("Export progress", {
        jobId,
        entityType,
        processed: offset + entities.length,
        exported: result.exported,
        failed: result.failed,
      });

      offset += batchSize;
      hasMore = entities.length === batchSize;
    }
  }

  /**
   * Handle export job errors
   */
  public async onError(
    error: Error,
    data: DirectoryExportJobData,
    jobId: string,
  ): Promise<void> {
    this.logger.error("Directory export job error handler called", {
      jobId,
      data,
      errorMessage: error.message,
      errorStack: error.stack,
    });

    // Additional error handling could be added here
  }

  /**
   * Validate and parse export job data
   */
  public validateAndParse(data: unknown): DirectoryExportJobData | null {
    try {
      const result = directoryExportJobSchema.parse(data);
      this.logger.debug("Directory export job data validation successful", {
        data: result,
      });
      return result;
    } catch (error) {
      this.logger.warn("Invalid directory export job data", {
        data,
        validationError: error instanceof z.ZodError ? error.errors : error,
      });
      return null;
    }
  }
}
