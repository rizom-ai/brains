import { BaseJobHandler } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ProgressReporter } from "@brains/utils";
import type { IDirectorySync } from "../types";
import {
  directoryDeleteJobSchema,
  type DeleteResult,
  type DirectoryDeleteJobData,
} from "../types";

export class DirectoryDeleteJobHandler extends BaseJobHandler<
  "directory-delete",
  DirectoryDeleteJobData,
  DeleteResult
> {
  private context: ServicePluginContext;

  constructor(
    logger: Logger,
    context: ServicePluginContext,
    _directorySync: IDirectorySync,
  ) {
    super(logger, {
      schema: directoryDeleteJobSchema,
      jobTypeName: "directory-delete",
    });
    this.context = context;
  }

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

  protected override summarizeDataForLog(
    data: DirectoryDeleteJobData,
  ): Record<string, unknown> {
    return {
      entityId: data.entityId,
      entityType: data.entityType,
      filePath: data.filePath,
    };
  }
}
