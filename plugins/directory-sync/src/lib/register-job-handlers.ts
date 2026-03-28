import type { ServicePluginContext } from "@brains/plugins";
import type { Logger } from "@brains/utils";
import type { IDirectorySync } from "../types";
import {
  DirectoryExportJobHandler,
  DirectoryImportJobHandler,
  DirectorySyncJobHandler,
  DirectoryDeleteJobHandler,
  DirectoryCleanupJobHandler,
  CoverImageConversionJobHandler,
  InlineImageConversionJobHandler,
} from "../handlers";

/**
 * Register all directory-sync job handlers with the job queue.
 */
export function registerDirectorySyncJobHandlers(
  context: ServicePluginContext,
  directorySync: IDirectorySync,
  logger: Logger,
): void {
  const childLogger = (name: string): Logger => logger.child(name);

  context.jobs.registerHandler(
    "directory-sync",
    new DirectorySyncJobHandler(
      childLogger("DirectorySyncJobHandler"),
      context,
      directorySync,
    ),
  );
  context.jobs.registerHandler(
    "directory-export",
    new DirectoryExportJobHandler(
      childLogger("DirectoryExportJobHandler"),
      context,
      directorySync,
    ),
  );
  context.jobs.registerHandler(
    "directory-import",
    new DirectoryImportJobHandler(
      childLogger("DirectoryImportJobHandler"),
      context,
      directorySync,
    ),
  );
  context.jobs.registerHandler(
    "directory-delete",
    new DirectoryDeleteJobHandler(
      childLogger("DirectoryDeleteJobHandler"),
      context,
      directorySync,
    ),
  );
  context.jobs.registerHandler(
    "directory-cleanup",
    new DirectoryCleanupJobHandler(
      childLogger("DirectoryCleanupJobHandler"),
      directorySync,
    ),
  );
  context.jobs.registerHandler(
    "cover-image-convert",
    new CoverImageConversionJobHandler(
      context,
      childLogger("CoverImageConversionJobHandler"),
    ),
  );
  context.jobs.registerHandler(
    "inline-image-convert",
    new InlineImageConversionJobHandler(
      context,
      childLogger("InlineImageConversionJobHandler"),
    ),
  );

  logger.debug("Registered async job handlers");
}
