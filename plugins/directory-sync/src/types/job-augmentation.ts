import type {
  DirectorySyncJobData,
  DirectoryExportJobData,
  DirectoryImportJobData,
  DirectoryDeleteJobData,
  CoverImageConversionJobData,
  InlineImageConversionJobData,
  ExportResult,
  ImportResult,
  SyncResult,
  DeleteResult,
} from "../types";
import type { CleanupResult } from "../lib/cleanup-pipeline";
import type { ImageConversionResult } from "../handlers/image-conversion-handler";
import type { InlineImageConversionResult } from "../handlers/inline-image-conversion-handler";

/**
 * Augment the PluginJobDefinitions interface to add directory sync job types
 */
declare module "@brains/job-queue" {
  interface PluginJobDefinitions {
    "directory-sync": {
      input: DirectorySyncJobData;
      output: SyncResult;
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
