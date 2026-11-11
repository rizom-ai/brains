import {
  firstPartyJobHandler,
  type FirstPartyJobHandler,
} from "@brains/sdk/internal/service-runtime";
import type { Logger } from "@brains/utils/logger";
import type { ProgressReporter } from "@brains/utils/progress";
import type { z } from "@brains/utils/zod";
import type { IDirectorySync } from "../types";
import {
  coverImageConversionJobSchema,
  directoryDeleteJobSchema,
  directoryExportJobSchema,
  directoryImportJobSchema,
  directorySyncJobSchema,
  inlineImageConversionJobSchema,
} from "../types/jobs";
import type { DirectorySyncOperationStatusService } from "./directory-sync-operation-status";
import type { GitReconciliationService } from "./git-reconciliation";
import type { DirectorySyncCore } from "./sync-context";
import {
  DirectoryExportJobHandler,
  DirectoryImportJobHandler,
  DirectorySyncJobHandler,
  DirectoryDeleteJobHandler,
  DirectoryCleanupJobHandler,
  CoverImageConversionJobHandler,
  InlineImageConversionJobHandler,
} from "../handlers";
import { directoryCleanupJobSchema } from "../handlers/directoryCleanupJobHandler";

/** A job its class handled, as its handler class runs and summarizes it. */
interface ClassJob<TInput> {
  process(
    data: TInput,
    jobId: string,
    progress: ProgressReporter,
    signal: AbortSignal,
  ): Promise<unknown>;
  summarizeDataForLog?(data: TInput): Record<string, unknown>;
}

/** The queue's job for a handler class: its schema, its run, its log summary. */
export function classJob<TInput>(
  type: string,
  input: z.ZodType<TInput, unknown>,
  handler: ClassJob<TInput>,
): FirstPartyJobHandler {
  const summarize = handler.summarizeDataForLog?.bind(handler);
  return firstPartyJobHandler({
    type,
    input,
    ...(summarize && { summarize }),
    process: ({ input: data, jobId, progress, signal }) =>
      handler.process(data, jobId, progress, signal),
  });
}

/**
 * Directory-sync's job handlers, as its class registered them with the job
 * queue, each under the type its class named.
 */
export function directorySyncJobHandlers(
  context: DirectorySyncCore,
  directorySync: IDirectorySync,
  logger: Logger,
  getDirectorySync: () => IDirectorySync = () => directorySync,
  operationStatus?: DirectorySyncOperationStatusService,
  reconciliation?: Pick<GitReconciliationService, "requireFullScan">,
): FirstPartyJobHandler[] {
  const childLogger = (name: string): Logger => logger.child(name);

  return [
    classJob(
      "directory-sync",
      directorySyncJobSchema,
      new DirectorySyncJobHandler(
        childLogger("DirectorySyncJobHandler"),
        context,
        getDirectorySync,
      ),
    ),
    classJob(
      "directory-export",
      directoryExportJobSchema,
      new DirectoryExportJobHandler(
        childLogger("DirectoryExportJobHandler"),
        context,
        directorySync,
        operationStatus,
      ),
    ),
    classJob(
      "directory-import",
      directoryImportJobSchema,
      new DirectoryImportJobHandler(
        childLogger("DirectoryImportJobHandler"),
        context,
        directorySync,
        operationStatus,
        reconciliation,
      ),
    ),
    classJob(
      "directory-delete",
      directoryDeleteJobSchema,
      new DirectoryDeleteJobHandler(
        childLogger("DirectoryDeleteJobHandler"),
        context,
        directorySync,
      ),
    ),
    classJob(
      "directory-cleanup",
      directoryCleanupJobSchema,
      new DirectoryCleanupJobHandler(
        childLogger("DirectoryCleanupJobHandler"),
        context,
        directorySync,
      ),
    ),
    classJob(
      "cover-image-convert",
      coverImageConversionJobSchema,
      new CoverImageConversionJobHandler(
        context,
        childLogger("CoverImageConversionJobHandler"),
      ),
    ),
    classJob(
      "inline-image-convert",
      inlineImageConversionJobSchema,
      new InlineImageConversionJobHandler(
        context,
        childLogger("InlineImageConversionJobHandler"),
      ),
    ),
  ];
}
