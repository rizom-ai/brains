import type { DirectorySyncHost } from "../host";
import type { Logger } from "@brains/utils/logger";
import type { ProgressContract } from "@brains/utils/progress";
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

export class DirectoryDeleteJobHandler {
  protected readonly logger: Logger;
  private context: DirectorySyncHost;
  private readonly directorySync: IDirectorySync;

  constructor(
    logger: Logger,
    context: DirectorySyncHost,
    directorySync: IDirectorySync,
  ) {
    this.logger = logger;
    this.context = context;
    this.directorySync = directorySync;
  }

  public async process(
    data: DirectoryDeleteJobData,
    _jobId: string,
    progressReporter: ProgressContract,
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

  private async deleteEntity(
    deletion: DirectoryDeleteTarget,
    progress: number,
    total: number,
    progressReporter: ProgressContract,
  ): Promise<DeleteResult> {
    this.logger.info("Processing entity deletion for removed file", deletion);

    try {
      const deleted = await this.context.mirror.deleteEntity({
        entityType: deletion.entityType,
        id: deletion.entityId,
        options: { persistenceOrigin: "directory-sync" },
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
