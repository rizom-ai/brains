import { BaseJobHandler } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import {
  directoryProjectionBatchRefSchema,
  type CleanupResult,
  type IDirectorySync,
} from "../types";
import { z } from "@brains/utils/zod";
import {
  runDirectoryProjectionBatchChild,
  settleDirectoryProjectionBatchChild,
} from "../lib/projection-batch-job";

const directoryCleanupJobSchema: z.ZodObject<{
  projectionBatch: z.ZodOptional<typeof directoryProjectionBatchRefSchema>;
}> = z.object({
  projectionBatch: directoryProjectionBatchRefSchema.optional(),
});

type DirectoryCleanupJobData = z.output<typeof directoryCleanupJobSchema>;

export class DirectoryCleanupJobHandler extends BaseJobHandler<
  "directory-cleanup",
  DirectoryCleanupJobData,
  CleanupResult
> {
  private readonly context: ServicePluginContext;
  private directorySync: IDirectorySync;

  constructor(
    logger: Logger,
    context: ServicePluginContext,
    directorySync: IDirectorySync,
  ) {
    super(logger, {
      schema: directoryCleanupJobSchema,
      jobTypeName: "directory-cleanup",
    });
    this.context = context;
    this.directorySync = directorySync;
  }

  async process(
    data: DirectoryCleanupJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<CleanupResult> {
    return runDirectoryProjectionBatchChild(
      this.context,
      data,
      jobId,
      async (): Promise<CleanupResult> => {
        await progressReporter.report({
          progress: 0,
          message: "Removing orphaned entities",
        });

        const result = await this.directorySync.removeOrphanedEntities();

        await progressReporter.report({
          progress: 100,
          message: `Cleanup complete: ${result.deleted} orphans removed`,
        });

        return result;
      },
    );
  }

  public async onTerminalSuccess(
    data: DirectoryCleanupJobData,
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
    data: DirectoryCleanupJobData,
    jobId: string,
  ): Promise<void> {
    await settleDirectoryProjectionBatchChild(
      this.context,
      data,
      jobId,
      "failed",
    );
  }
}
