import type { ImportResult } from "../types.js";
import { isEntityValidationError } from "@brains/plugins";
import { getErrorMessage } from "@brains/utils/error";
import type { Logger } from "@brains/utils/logger";
import { appendFile, readFile, rename, rm } from "fs/promises";
import { join } from "path";
import { resolveInSyncPath } from "./path-utils";

export class Quarantine {
  private logger: Logger;
  private syncPath: string;
  constructor(logger: Logger, syncPath: string) {
    this.logger = logger;
    this.syncPath = syncPath;
  }

  isValidationError(error: unknown): boolean {
    return isEntityValidationError(error);
  }

  async quarantineInvalidFile(
    filePath: string,
    error: unknown,
    result: ImportResult,
    resolveFilePath: (filePath: string) => string,
  ): Promise<void> {
    const fullPath = resolveFilePath(filePath);
    const quarantinePath = `${fullPath}.invalid`;

    try {
      await rename(fullPath, quarantinePath);
      result.quarantined++;
      result.quarantinedFiles.push(filePath);

      const errorLogPath = join(this.syncPath, ".import-errors.log");
      const timestamp = new Date().toISOString();
      const errorMessage = getErrorMessage(error);
      const logEntry = `${timestamp} - ${filePath}: ${errorMessage}\n\u2192 ${filePath}.invalid\n\n`;

      await appendFile(errorLogPath, logEntry);

      this.logger.warn("Quarantined invalid entity file", {
        originalPath: filePath,
        quarantinePath: `${filePath}.invalid`,
        error: errorMessage,
      });
    } catch (renameError) {
      this.logger.error("Failed to quarantine invalid file", {
        path: filePath,
        error: renameError,
      });
      result.failed++;
      result.errors.push({
        path: filePath,
        error: "Failed to quarantine invalid file",
      });
    }
  }

  async markAsRecoveredIfNeeded(filePath: string): Promise<void> {
    try {
      const quarantinePath = `${resolveInSyncPath(this.syncPath, filePath)}.invalid`;
      await rm(quarantinePath, { force: true });
    } catch (error) {
      this.logger.debug("Could not retire recovered quarantine artifact", {
        path: filePath,
        error,
      });
    }

    const errorLogPath = join(this.syncPath, ".import-errors.log");
    try {
      const logContent = await readFile(errorLogPath, "utf-8");
      const failureToken = ` - ${filePath}:`;
      const recoveryToken = ` - [RECOVERED] ${filePath}`;
      if (
        logContent.lastIndexOf(failureToken) <=
        logContent.lastIndexOf(recoveryToken)
      ) {
        return;
      }

      const timestamp = new Date().toISOString();
      await appendFile(
        errorLogPath,
        `${timestamp} - [RECOVERED] ${filePath}\n`,
      );
      this.logger.debug("Marked file as recovered in error log", {
        path: filePath,
      });
    } catch (error) {
      if (isMissingFileError(error)) return;
      this.logger.debug("Could not update error log for recovered file", {
        path: filePath,
        error,
      });
    }
  }
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
