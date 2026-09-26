import type { DirectorySyncHost } from "../host";
import type { Logger } from "@brains/utils/logger";
import type { ProgressContract } from "@brains/utils/progress";
import type { GitReconciliationService } from "../lib/git-reconciliation";
import type { DirectorySyncOperationStatusService } from "../lib/directory-sync-operation-status";
import {
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
  protected readonly logger: Logger;
  private readonly context: DirectorySyncHost;
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
    logger: Logger,
    context: DirectorySyncHost,
    getDirectorySync: () => IDirectorySync,
    getGitSync: () => IGitSync,
    reconciliation: Pick<GitReconciliationService, "pullAndQueue">,
    operationStatus?: Pick<
      DirectorySyncOperationStatusService,
      "createProgressObserver"
    >,
  ) {
    this.logger = logger;
    this.context = context;
    this.getDirectorySync = getDirectorySync;
    this.getGitSync = getGitSync;
    this.reconciliation = reconciliation;
    this.operationStatus = operationStatus;
  }

  async process(
    data: DirectorySyncRequestJobData,
    jobId: string,
    progressReporter: ProgressContract,
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
