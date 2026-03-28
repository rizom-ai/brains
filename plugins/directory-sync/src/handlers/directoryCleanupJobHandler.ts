import { BaseJobHandler } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { ProgressReporter } from "@brains/utils";
import type { DirectorySync } from "../lib/directory-sync";
import type { CleanupResult } from "../lib/cleanup-pipeline";
import { z } from "@brains/utils";

const directoryCleanupJobSchema = z.object({});

export class DirectoryCleanupJobHandler extends BaseJobHandler<
  "directory-cleanup",
  Record<string, never>,
  CleanupResult
> {
  private directorySync: DirectorySync;

  constructor(logger: Logger, directorySync: DirectorySync) {
    super(logger, {
      schema: directoryCleanupJobSchema,
      jobTypeName: "directory-cleanup",
    });
    this.directorySync = directorySync;
  }

  async process(
    _data: Record<string, never>,
    _jobId: string,
    progressReporter: ProgressReporter,
  ): Promise<CleanupResult> {
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
  }
}
