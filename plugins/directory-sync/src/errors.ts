import { BrainsError, normalizeError, type ErrorCause } from "@brains/utils";

/**
 * Base error class for directory-sync plugin operations
 */
export class DirectorySyncError extends BrainsError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(
      message,
      "DIRECTORY_SYNC_ERROR",
      normalizeError(cause),
      context ?? {},
    );
  }
}

/**
 * Error thrown when file system operations fail
 */
export class FileSystemError extends DirectorySyncError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "FileSystemError";
  }
}

/**
 * Error thrown when entity serialization/deserialization fails
 */
export class EntitySerializationError extends DirectorySyncError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "EntitySerializationError";
  }
}

/**
 * Error thrown when path resolution fails
 */
export class PathResolutionError extends DirectorySyncError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "PathResolutionError";
  }
}

/**
 * Error thrown when directory watching fails
 */
export class DirectoryWatchError extends DirectorySyncError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "DirectoryWatchError";
  }
}

/**
 * Error thrown when directory-sync plugin initialization fails
 */
export class DirectorySyncInitializationError extends DirectorySyncError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "DirectorySyncInitializationError";
  }
}
