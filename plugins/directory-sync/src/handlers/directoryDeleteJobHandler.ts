import { z } from "@brains/utils";
import type { JobHandler } from "@brains/plugins";
import type {
  Logger,
  ProgressReporter,
  ServicePluginContext,
} from "@brains/plugins";
import type { DirectorySync } from "../lib/directory-sync";
import type { DeleteResult, DirectoryDeleteJobData } from "../types";

/**
 * Schema for directory delete job data
 */
const directoryDeleteJobSchema = z.object({
  entityId: z.string(),
  entityType: z.string(),
  filePath: z.string(),
});

/**
 * Job handler for async directory delete operations
 * Processes entity deletions when files are removed from disk
 */
export class DirectoryDeleteJobHandler
  implements
    JobHandler<"directory-delete", DirectoryDeleteJobData, DeleteResult>
{
  private logger: Logger;
  private context: ServicePluginContext;

  /**
   * Create a new instance of the job handler
   */
  constructor(
    logger: Logger,
    context: ServicePluginContext,
    _directorySync: DirectorySync,
  ) {
    this.logger = logger;
    this.context = context;
  }

  /**
   * Validate and parse delete job data
   */
  public validateAndParse(data: unknown): DirectoryDeleteJobData | null {
    try {
      const parsed = directoryDeleteJobSchema.parse(data);
      this.logger.debug("Directory delete job data validation successful", {
        data: parsed,
      });
      return parsed;
    } catch (error) {
      this.logger.error("Failed to validate directory delete job data", {
        error,
        data,
      });
      return null;
    }
  }

  /**
   * Process directory delete job
   * Deletes an entity from the database when its file is removed
   */
  public async process(
    data: DirectoryDeleteJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<DeleteResult> {
    const validatedData = directoryDeleteJobSchema.parse(data);

    this.logger.info("Processing entity deletion for removed file", {
      entityId: validatedData.entityId,
      entityType: validatedData.entityType,
      filePath: validatedData.filePath,
    });

    await progressReporter.report({
      progress: 0,
      total: 1,
      message: `Deleting ${validatedData.entityType}:${validatedData.entityId}`,
    });

    try {
      // Delete the entity from the database
      const deleted = await this.context.entityService.deleteEntity(
        validatedData.entityType,
        validatedData.entityId,
      );

      if (deleted) {
        this.logger.info("Successfully deleted entity for removed file", {
          entityId: validatedData.entityId,
          entityType: validatedData.entityType,
        });
      } else {
        this.logger.warn("Entity not found in database", {
          entityId: validatedData.entityId,
          entityType: validatedData.entityType,
        });
      }

      await progressReporter.report({
        progress: 1,
        total: 1,
        message: `Deleted ${validatedData.entityType}:${validatedData.entityId}`,
      });

      return {
        deleted,
        entityId: validatedData.entityId,
        entityType: validatedData.entityType,
        filePath: validatedData.filePath,
      };
    } catch (error) {
      this.logger.error("Failed to delete entity", {
        entityId: validatedData.entityId,
        entityType: validatedData.entityType,
        error,
      });
      throw error;
    }
  }

  /**
   * Handle job errors
   */
  public async onError(
    error: Error,
    data: DirectoryDeleteJobData,
    jobId: string,
  ): Promise<void> {
    this.logger.error("Delete job failed", {
      jobId,
      entityId: data.entityId,
      entityType: data.entityType,
      filePath: data.filePath,
      error: error.message,
    });
  }
}
