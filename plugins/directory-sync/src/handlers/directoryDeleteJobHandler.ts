import { BaseJobHandler } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import type { IDirectorySync } from "../types";
import {
  directoryDeleteJobSchema,
  type DeleteResult,
  type DirectoryDeleteJobData,
  type DirectoryDeleteJobResult,
  type DirectoryDeleteTarget,
} from "../types";
import {
  runDirectoryProjectionBatchChild,
  settleDirectoryProjectionBatchChild,
} from "../lib/projection-batch-job";

export class DirectoryDeleteJobHandler extends BaseJobHandler<
  "directory-delete",
  DirectoryDeleteJobData,
  DirectoryDeleteJobResult
> {
  private context: ServicePluginContext;
  private readonly directorySync: IDirectorySync;

  constructor(
    logger: Logger,
    context: ServicePluginContext,
    directorySync: IDirectorySync,
  ) {
    super(logger, {
      schema: directoryDeleteJobSchema,
      jobTypeName: "directory-delete",
    });
    this.context = context;
    this.directorySync = directorySync;
  }

  public async process(
    data: DirectoryDeleteJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<DirectoryDeleteJobResult> {
    return runDirectoryProjectionBatchChild(
      this.context,
      data,
      _jobId,
      async (): Promise<DirectoryDeleteJobResult> => {
        const validatedData = directoryDeleteJobSchema.parse(data);
        const isBatch = "deletions" in validatedData;
        const deletions = isBatch ? validatedData.deletions : [validatedData];

        await progressReporter.report({
          progress: 0,
          total: deletions.length,
          message:
            deletions.length === 1
              ? `Deleting ${deletions[0]?.entityType}:${deletions[0]?.entityId}`
              : `Deleting ${deletions.length} entities`,
        });

        const results: DeleteResult[] = [];
        for (const [index, deletion] of deletions.entries()) {
          results.push(
            await this.deleteEntity(
              deletion,
              index + 1,
              deletions.length,
              progressReporter,
            ),
          );
        }

        if (isBatch) return results;
        const result = results[0];
        if (!result) throw new Error("Directory delete job has no targets");
        return result;
      },
    );
  }

  public async onTerminalSuccess(
    data: DirectoryDeleteJobData,
    jobId: string,
  ): Promise<void> {
    await settleDirectoryProjectionBatchChild(
      this.context,
      data,
      jobId,
      "completed",
    );
  }

  public async onTerminalError(
    _error: Error,
    data: DirectoryDeleteJobData,
    jobId: string,
  ): Promise<void> {
    await settleDirectoryProjectionBatchChild(
      this.context,
      data,
      jobId,
      "failed",
    );
  }

  protected override summarizeDataForLog(
    data: DirectoryDeleteJobData,
  ): Record<string, unknown> {
    if ("deletions" in data) return { deletionCount: data.deletions.length };
    return {
      entityId: data.entityId,
      entityType: data.entityType,
      filePath: data.filePath,
    };
  }

  private async deleteEntity(
    deletion: DirectoryDeleteTarget,
    progress: number,
    total: number,
    progressReporter: ProgressReporter,
  ): Promise<DeleteResult> {
    this.logger.info("Processing entity deletion for removed file", deletion);

    try {
      const deleted = await this.context.entityService.deleteEntity({
        entityType: deletion.entityType,
        id: deletion.entityId,
      });

      if (deleted) {
        this.logger.info("Successfully deleted entity for removed file", {
          entityId: deletion.entityId,
          entityType: deletion.entityType,
        });
      } else {
        this.logger.warn("Entity not found in database", {
          entityId: deletion.entityId,
          entityType: deletion.entityType,
        });
      }

      await progressReporter.report({
        progress,
        total,
        message: `Deleted ${deletion.entityType}:${deletion.entityId}`,
      });

      this.directorySync.completePendingDelete(
        deletion.entityType,
        deletion.entityId,
        deletion.filePath,
      );

      return { deleted, ...deletion };
    } catch (error) {
      this.logger.error("Failed to delete entity", { ...deletion, error });
      throw error;
    }
  }
}
