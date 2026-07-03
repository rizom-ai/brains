import { BaseJobHandler } from "@brains/plugins";
import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import {
  directorySyncRequestJobSchema,
  type BatchResult,
  type DirectorySyncRequestJobData,
  type IDirectorySync,
  type IGitSync,
} from "../types";

export interface DirectorySyncRequestJobResult {
  gitPulled: true;
  batchQueued: boolean;
  batchId?: string;
  importOperations?: number;
  totalFiles?: number;
}

export class DirectorySyncRequestJobHandler extends BaseJobHandler<
  "sync-request",
  DirectorySyncRequestJobData,
  DirectorySyncRequestJobResult
> {
  constructor(
    logger: Logger,
    private readonly context: ServicePluginContext,
    private readonly directorySync: IDirectorySync,
    private readonly gitSync: IGitSync,
  ) {
    super(logger, {
      schema: directorySyncRequestJobSchema,
      jobTypeName: "sync-request",
    });
  }

  async process(
    data: DirectorySyncRequestJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<DirectorySyncRequestJobResult> {
    await progressReporter.report({
      progress: 5,
      message: "Pulling latest content from git",
    });

    const result = await this.gitSync.withLock(async () => {
      await this.gitSync.pull();

      await progressReporter.report({
        progress: 35,
        message: "Scanning pulled content for sync changes",
      });

      return this.directorySync.queueSyncBatch(this.context, data.source, {
        rootJobId: jobId,
        interfaceType: data.interfaceType,
        channelId: data.channelId,
      });
    });

    if (!result) {
      await progressReporter.report({
        progress: 100,
        message: "Sync complete: no files to import",
      });
      return { gitPulled: true, batchQueued: false };
    }

    await progressReporter.report({
      progress: 100,
      message: `Sync queued: ${result.importOperationsCount} import jobs for ${result.totalFiles} files`,
    });

    return toJobResult(result);
  }

  protected override summarizeDataForLog(
    data: DirectorySyncRequestJobData,
  ): Record<string, unknown> {
    return {
      source: data.source,
      interfaceType: data.interfaceType,
      channelId: data.channelId,
    };
  }
}

function toJobResult(result: BatchResult): DirectorySyncRequestJobResult {
  return {
    gitPulled: true,
    batchQueued: true,
    batchId: result.batchId,
    importOperations: result.importOperationsCount,
    totalFiles: result.totalFiles,
  };
}
