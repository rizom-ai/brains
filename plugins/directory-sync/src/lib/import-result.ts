import type { Logger } from "@brains/utils";
import type { ImportResult } from "../types";

export function createImportResult(): ImportResult {
  return {
    imported: 0,
    skipped: 0,
    failed: 0,
    quarantined: 0,
    quarantinedFiles: [],
    errors: [],
    jobIds: [],
  };
}

export function recordSkippedImport(result: ImportResult): void {
  result.skipped++;
}

export function recordImportReadError(
  logger: Logger,
  filePath: string,
  error: unknown,
  result: ImportResult,
): void {
  // File disappeared between scan and read (e.g., git-sync pull race)
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    logger.debug("File disappeared before import, skipping", {
      path: filePath,
    });
    recordSkippedImport(result);
    return;
  }

  result.failed++;
  result.errors.push({
    path: filePath,
    error: error instanceof Error ? error.message : "Failed to import entity",
  });
  logger.error("Failed to import entity", {
    path: filePath,
    error,
  });
}

export function logImportSummary(
  logger: Logger,
  fileCount: number,
  result: ImportResult,
): void {
  if (fileCount > 1) {
    logger.debug("Import completed", {
      filesProcessed: fileCount,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
      quarantined: result.quarantined,
    });
  } else {
    logger.debug("Import completed", result);
  }
}
