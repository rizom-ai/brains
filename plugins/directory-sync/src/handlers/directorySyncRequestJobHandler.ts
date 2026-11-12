import type { DirectorySyncCore } from "../lib/sync-context";
import type { ProgressReporter } from "@brains/utils/progress";
import type { GitReconciliationService } from "../lib/git-reconciliation";
import type { DirectorySyncOperationStatusService } from "../lib/directory-sync-operation-status";
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

export class DirectorySyncRequestJobHandler {
  /** The data the queue hands this job, as its schema parses it. */
  readonly schema: typeof directorySyncRequestJobSchema =
    directorySyncRequestJobSchema;
  private readonly context: DirectorySyncCore;
  private readonly getDirectorySync: () => IDirectorySync;
  private readonly getGitSync: () => IGitSync;
  private readonly reconciliation: Pick<
    GitReconciliationService,
    "pullAndQueue"
  >;
  /** Only the progress observer is read; the whole service is more than this asks. */
  private readonly operationStatus:
    | Pick<DirectorySyncOperationStatusService, "createProgressObserver">
    | undefined;
  constructor(
    context: DirectorySyncCore,
    getDirectorySync: () => IDirectorySync,
    getGitSync: () => IGitSync,
    reconciliation: Pick<GitReconciliationService, "pullAndQueue">,
    operationStatus?: Pick<
      DirectorySyncOperationStatusService,
      "createProgressObserver"
    >,
  ) {
    this.context = context;
    this.getDirectorySync = getDirectorySync;
    this.getGitSync = getGitSync;
    this.reconciliation = reconciliation;
    this.operationStatus = operationStatus;
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

    const onGitProgress = data.runId
      ? this.operationStatus?.createProgressObserver(data.runId)
      : undefined;
    onGitProgress?.();
    const reconciled = await this.reconciliation.pullAndQueue({
      gitSync: this.getGitSync(),
      directorySync: this.getDirectorySync(),
      context: this.context,
      source: data.source,
      full: data.full,
      ...(onGitProgress ? { onGitProgress } : {}),
      metadata: {
        rootJobId: jobId,
        interfaceType: data.interfaceType,
        channelId: data.channelId,
      },
    });
    const result = reconciled.batch;

    await progressReporter.report({
      progress: 35,
      message: "Scanning pulled content for sync changes",
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

  public summarizeDataForLog(
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
