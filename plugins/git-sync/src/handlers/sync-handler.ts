import { BaseJobHandler } from "@brains/plugins";
import { z, PROGRESS_STEPS, JobResult } from "@brains/utils";
import type { Logger, ProgressReporter } from "@brains/utils";
import type { GitSync } from "../lib/git-sync";

export const syncJobSchema = z.object({
  manualSync: z.boolean(),
});

export type SyncJobData = z.infer<typeof syncJobSchema>;

export interface SyncJobResult {
  success: boolean;
  error?: string;
}

export class SyncJobHandler extends BaseJobHandler<
  "sync",
  SyncJobData,
  SyncJobResult
> {
  constructor(
    logger: Logger,
    private gitSync: GitSync,
  ) {
    super(logger, {
      schema: syncJobSchema,
      jobTypeName: "sync",
    });
  }

  async process(
    data: SyncJobData,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<SyncJobResult> {
    try {
      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.START,
        message: "Starting git sync",
      });

      await this.gitSync.sync(data.manualSync);

      await this.reportProgress(progressReporter, {
        progress: PROGRESS_STEPS.COMPLETE,
        message: "Git sync completed",
      });

      return { success: true };
    } catch (error) {
      this.logger.error("Sync job failed", { error });
      return JobResult.failure(error) as SyncJobResult;
    }
  }
}
