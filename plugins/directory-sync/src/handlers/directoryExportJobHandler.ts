import { z } from "zod";
import type { JobHandler } from "@brains/job-queue";
import type { Logger } from "@brains/types";
import type { PluginContext } from "@brains/plugin-utils";
import type { DirectorySync } from "../directorySync";
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
 * Job handler for batch directory export operations
 * Processes entity exports in batches with progress tracking
 * Implements Component Interface Standardization pattern
 */
export class DirectoryExportJobHandler
  implements
    JobHandler<"directory-export", DirectoryExportJobData, ExportResult>
{
  private static instance: DirectoryExportJobHandler | null = null;
  private logger: Logger;
  private context: PluginContext;
  private directorySync: DirectorySync;

  /**
   * Get the singleton instance
   */
  public static getInstance(
    logger: Logger,
    context: PluginContext,
    directorySync: DirectorySync,
  ): DirectoryExportJobHandler {
    DirectoryExportJobHandler.instance ??= new DirectoryExportJobHandler(
      logger,
      context,
      directorySync,
    );
    return DirectoryExportJobHandler.instance;
  }

  /**
   * Reset the singleton instance (primarily for testing)
   */
  public static resetInstance(): void {
    DirectoryExportJobHandler.instance = null;
  }

  /**
   * Create a fresh instance without affecting the singleton
   */
  public static createFresh(
    logger: Logger,
    context: PluginContext,
    directorySync: DirectorySync,
  ): DirectoryExportJobHandler {
    return new DirectoryExportJobHandler(logger, context, directorySync);
  }

  /**
   * Private constructor to enforce singleton pattern
   */
  private constructor(
    logger: Logger,
    context: PluginContext,
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
      this.logger.info("Starting export", {
        jobId,
        entityTypes: typesToExport,
      });

      // Process each entity type
      for (const entityType of typesToExport) {
        await this.exportEntityType(entityType, data.batchSize, jobId, result);
      }

      // Log completion
      this.logger.info("Export completed", {
        jobId,
        exported: result.exported,
        failed: result.failed,
        duration: Date.now() - startTime,
      });

      this.logger.info("Directory export job completed", {
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
