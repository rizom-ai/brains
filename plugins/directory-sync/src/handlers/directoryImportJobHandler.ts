import type { DirectorySyncCore } from "../lib/sync-context";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import {
  directoryImportJobSchema,
  type ImportResult,
  type DirectoryImportJobData,
  type IDirectorySync,
} from "../types";
import type { DirectorySyncOperationStatusService } from "../lib/directory-sync-operation-status";
import type { GitReconciliationService } from "../lib/git-reconciliation";
import { getErrorMessage } from "@brains/utils/error";
import {
  runDirectoryProjectionBatchChild,
  settleDirectoryProjectionBatchChild,
} from "../lib/projection-batch-job";

export class DirectoryImportJobHandler {
  /** The data the queue hands this job, as its schema parses it. */
  readonly schema: typeof directoryImportJobSchema = directoryImportJobSchema;
  private readonly logger: Logger;
  private directorySync: IDirectorySync;
  private readonly context: DirectorySyncCore;
  private readonly operationStatus:
    DirectorySyncOperationStatusService | undefined;
  private readonly reconciliation:
    Pick<GitReconciliationService, "requireFullScan"> | undefined;

  constructor(
    logger: Logger,
    context: DirectorySyncCore,
    directorySync: IDirectorySync,
    operationStatus?: DirectorySyncOperationStatusService,
    reconciliation?: Pick<GitReconciliationService, "requireFullScan">,
  ) {
    this.logger = logger;
    this.context = context;
    this.directorySync = directorySync;
    this.operationStatus = operationStatus;
    this.reconciliation = reconciliation;
  }

  public async process(
    data: DirectoryImportJobData,
    jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<ImportResult> {
    this.logger.debug("Processing directory import job", { jobId, data });

    return runDirectoryProjectionBatchChild(
      this.context,
      data,
      jobId,
      async (): Promise<ImportResult> => {
        await this.refuseUnregisteredEntityTypes(data, jobId);
        const startTime = Date.now();

        try {
          const result = await this.directorySync.importEntitiesWithProgress(
            data.paths,
            progressReporter,
            data.batchSize ?? 100,
            data.projectionBatch,
            data.plan,
          );

          this.logger.debug("Directory import job completed", {
            jobId,
            imported: result.imported,
            skipped: result.skipped,
            failed: result.failed,
            quarantined: result.quarantined,
            duration: Date.now() - startTime,
          });
          await this.operationStatus?.addImportResult(result);

          return result;
        } catch (error) {
          this.logger.error("Directory import job failed", { jobId, error });
          await this.operationStatus?.recordIssue({
            kind: "import",
            message: getErrorMessage(error, "Directory import failed"),
          });
          throw error;
        }
      },
    );
  }

  /**
   * A worker that does not register a type the scheduler admitted would skip
   * those files as unknown and complete the job, so the sync reports success
   * without importing them. That happens when the previous container's
   * worker shares the job queue during a rolling deploy. Fail instead: the
   * job retries, and the next sync rescans every file whatever happens to it.
   */
  private async refuseUnregisteredEntityTypes(
    data: DirectoryImportJobData,
    jobId: string,
  ): Promise<void> {
    const missing = (data.entityTypes ?? []).filter(
      (entityType) => !this.context.entityService.hasEntityType(entityType),
    );
    if (missing.length === 0) return;

    const message = `Directory import needs entity types this process does not register: ${missing.join(", ")}`;
    this.logger.warn(message, { jobId });
    await this.reconciliation?.requireFullScan();
    await this.operationStatus?.recordIssue({ kind: "import", message });
    throw new Error(message);
  }

  public async onTerminalSuccess(
    data: DirectoryImportJobData,
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
    data: DirectoryImportJobData,
    jobId: string,
  ): Promise<void> {
    await settleDirectoryProjectionBatchChild(
      this.context,
      data,
      jobId,
      "failed",
    );
  }

  public summarizeDataForLog(
    data: DirectoryImportJobData,
  ): Record<string, unknown> {
    return {
      pathCount: data.paths?.length ?? "all",
      batchSize: data.batchSize,
    };
  }
}
