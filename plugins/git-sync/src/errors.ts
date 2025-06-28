import { BrainsError, normalizeError, type ErrorCause } from "@brains/utils";

/**
 * Base error class for git-sync plugin operations
 */
export class GitSyncError extends BrainsError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, "GIT_SYNC_ERROR", normalizeError(cause), context ?? {});
  }
}

/**
 * Error thrown when git repository operations fail
 */
export class GitRepositoryError extends GitSyncError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "GitRepositoryError";
  }
}

/**
 * Error thrown when git network operations fail (push, pull, clone)
 */
export class GitNetworkError extends GitSyncError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "GitNetworkError";
  }
}

/**
 * Error thrown when git authentication fails
 */
export class GitAuthenticationError extends GitSyncError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "GitAuthenticationError";
  }
}

/**
 * Error thrown when git-sync plugin initialization fails
 */
export class GitSyncInitializationError extends GitSyncError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "GitSyncInitializationError";
  }
}

/**
 * Error thrown when git commit operations fail
 */
export class GitCommitError extends GitSyncError {
  constructor(
    message: string,
    cause: ErrorCause,
    context?: Record<string, unknown>,
  ) {
    super(message, cause, context);
    this.name = "GitCommitError";
  }
}
