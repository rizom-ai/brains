import type {
  DirectorySyncJobData,
  DirectoryExportJobData,
  DirectoryImportJobData,
  ExportResult,
  ImportResult,
  SyncResult,
} from "../types";

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
  }
}
