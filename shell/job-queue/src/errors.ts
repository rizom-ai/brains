/**
 * Job queue error classes
 */

/**
 * Job operation error
 */
export class JobOperationError extends Error {
  constructor(
    message: string,
    public readonly context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "JobOperationError";
  }
}
