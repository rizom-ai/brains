import type { DirectoryExportJobData } from "../handlers/directoryExportJobHandler";
import type { DirectoryImportJobData } from "../handlers/directoryImportJobHandler";
import type { ExportResult, ImportResult } from "../types";

/**
 * Augment the PluginJobDefinitions interface to add directory sync job types
 */
declare module "@brains/job-queue" {
  interface PluginJobDefinitions {
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
