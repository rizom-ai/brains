import type {
  DirectorySyncJobData,
  DirectoryExportJobData,
  DirectoryImportJobData,
  DirectorySyncRequestJobData,
  DirectoryDeleteJobData,
  CoverImageConversionJobData,
  InlineImageConversionJobData,
  CleanupResult,
  ExportResult,
  ImportResult,
  SyncResult,
  DeleteResult,
} from "../types";
import type { ImageConversionResult } from "../handlers/image-conversion-handler";
import type { InlineImageConversionResult } from "../handlers/inline-image-conversion-handler";
import type { DirectorySyncRequestJobResult } from "../handlers/directorySyncRequestJobHandler";

/**
 * Augment the PluginJobDefinitions interface to add directory sync job types
 */
declare module "@brains/job-queue" {
  interface PluginJobDefinitions {
    "directory-sync": {
      input: DirectorySyncJobData;
      output: SyncResult;
    };
    "directory-sync:sync-request": {
      input: DirectorySyncRequestJobData;
      output: DirectorySyncRequestJobResult;
    };
    "directory-export": {
      input: DirectoryExportJobData;
      output: ExportResult;
    };
    "directory-import": {
      input: DirectoryImportJobData;
      output: ImportResult;
    };
    "directory-delete": {
      input: DirectoryDeleteJobData;
      output: DeleteResult;
    };
    "directory-cleanup": {
      input: Record<string, never>;
      output: CleanupResult;
    };
    "cover-image-convert": {
      input: CoverImageConversionJobData;
      output: ImageConversionResult;
    };
    "inline-image-convert": {
      input: InlineImageConversionJobData;
      output: InlineImageConversionResult;
    };
  }
}
