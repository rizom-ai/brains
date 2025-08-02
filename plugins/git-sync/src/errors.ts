/**
 * Base error class for git-sync plugin operations
 */
export class GitSyncError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GitSyncError";
  }
}

/**
 * Error thrown when git repository operations fail
 */
export class GitRepositoryError extends GitSyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "GitRepositoryError";
  }
}

/**
 * Error thrown when git network operations fail (push, pull, clone)
 */
export class GitNetworkError extends GitSyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "GitNetworkError";
  }
}

/**
 * Error thrown when git authentication fails
 */
export class GitAuthenticationError extends GitSyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "GitAuthenticationError";
  }
}

/**
 * Error thrown when git-sync plugin initialization fails
 */
export class GitSyncInitializationError extends GitSyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "GitSyncInitializationError";
  }
}

/**
 * Error thrown when git commit operations fail
 */
export class GitCommitError extends GitSyncError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, context);
    this.name = "GitCommitError";
  }
}
