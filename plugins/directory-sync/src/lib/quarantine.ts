import type { Logger } from "@brains/utils";
import type { ImportResult } from "../types.js";
import { getErrorMessage, z } from "@brains/utils";
import {
  existsSync,
  renameSync,
  appendFileSync,
  readFileSync,
  writeFileSync,
} from "fs";
import { join } from "path";

export class Quarantine {
  constructor(
    private logger: Logger,
    private syncPath: string,
  ) {}

  isValidationError(error: unknown): boolean {
    if (error instanceof z.ZodError) {
      return true;
    }
    const message = getErrorMessage(error);
    return (
      message.includes("invalid_type") ||
      message.includes("invalid_enum_value") ||
      message.includes("Required") ||
      message.includes("Invalid frontmatter") ||
      message.includes("Unknown entity type")
    );
  }

  quarantineInvalidFile(
    filePath: string,
    error: unknown,
    result: ImportResult,
    resolveFilePath: (filePath: string) => string,
  ): void {
    const fullPath = resolveFilePath(filePath);
    const quarantinePath = `${fullPath}.invalid`;

    try {
      renameSync(fullPath, quarantinePath);
      result.quarantined++;
      result.quarantinedFiles.push(filePath);

      const errorLogPath = join(this.syncPath, ".import-errors.log");
      const timestamp = new Date().toISOString();
      const errorMessage = getErrorMessage(error);
      const logEntry = `${timestamp} - ${filePath}: ${errorMessage}\n\u2192 ${filePath}.invalid\n\n`;

      appendFileSync(errorLogPath, logEntry);

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

  markAsRecoveredIfNeeded(filePath: string): void {
    const errorLogPath = join(this.syncPath, ".import-errors.log");

    if (!existsSync(errorLogPath)) {
      return;
    }

    try {
      const logContent = readFileSync(errorLogPath, "utf-8");

      if (logContent.includes(filePath)) {
        const timestamp = new Date().toISOString();
        const recoveryMarker = `${timestamp} - [RECOVERED] ${filePath}\n`;
        const lines = logContent.split("\n");
        const newLines: string[] = [];
        let skipNext = false;

        for (const line of lines) {
          if (skipNext) {
            skipNext = false;
            continue;
          }

          if (line.includes(filePath) && !line.includes("[RECOVERED]")) {
            newLines.push(recoveryMarker.trim());
            skipNext = true;
          } else {
            newLines.push(line);
          }
        }

        writeFileSync(errorLogPath, newLines.join("\n"));

        this.logger.debug("Marked file as recovered in error log", {
          path: filePath,
        });
      }
    } catch (error) {
      this.logger.debug("Could not update error log for recovered file", {
        path: filePath,
        error,
      });
    }
  }
}
